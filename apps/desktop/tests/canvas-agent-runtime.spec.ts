import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { openAgent } from '../src/main/agent/runtime';
import { CanvasBroker } from '../src/main/agent/canvas-broker';
import { canvasPack } from '../src/main/agent/packs/canvas';
import type { ToolContext } from '../src/main/agent/kernel/capability';
import { graphRevision } from '../src/main/projects/canvas-engine';
import { ProjectStore } from '../src/main/projects/project-store';
import { storedForm } from '../src/renderer/src/features/creation/project-records';
import { createMedia, createProject } from '../src/renderer/src/features/creation/types';
import type { ChatMessage } from '../src/shared/agent';
import { relayModel } from './helpers/models';

test('Pi canvas tools read, persist an edit and consume its receipt before reporting success', async () => {
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const step = body.messages.filter((m: { role: string }) => m.role === 'tool').length;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const write = (delta: unknown, finish: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({ id: 'canvas', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      );
    if (step < 3) {
      const name = ['get_canvas_summary', 'get_node_details', 'edit_canvas'][step];
      const args =
        step === 0
          ? {}
          : step === 1
            ? { nodeIds: ['image-a'] }
            : {
                operations: [
                  { kind: 'update_node', nodeId: 'image-a', patch: { prompt: '新的提示词' } },
                ],
              };
      write({
        tool_calls: [
          {
            index: 0,
            id: `call-${step}`,
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      });
      write({}, 'tool_calls');
    } else {
      write({ content: '已根据保存回执修改提示词。' });
      write({}, 'stop');
    }
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server');
  const p = createProject();
  p.nodes.push({
    id: 'image-a',
    type: 'media',
    position: { x: 0, y: 0 },
    data: createMedia('image'),
  });
  const store = new ProjectStore(test.info().outputPath('projects'));
  await store.initialize();
  await store.create(storedForm(p).project);
  const before = store.get(p.id).project;
  // No window shows the project: edits go straight to the store, focusing is not possible.
  const broker = new CanvasBroker();
  broker.dispatch = () => {
    throw new Error('no window should be asked');
  };
  const output: ChatMessage = { id: randomUUID(), role: 'assistant', text: '', status: 'running' };
  const recorded: Parameters<ToolContext['record']>[0][] = [];
  const pack = canvasPack(
    {
      owner: -1,
      sessionId: randomUUID(),
      runId: randomUUID(),
      output,
      changed: () => {},
      record: (change) => recorded.push(change),
    },
    { projectId: p.id, selectedIds: ['image-a'] },
    { store, broker, focusOwner: () => undefined },
  );
  const runtime = await openAgent(
    test.info().outputPath('runtime'),
    randomUUID(),
    relayModel({ baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'mock' }),
    { packs: [pack] },
  );
  try {
    expect(runtime.session.getActiveToolNames().sort()).toEqual(
      pack.tools.map((t) => t.name).sort(),
    );
    await runtime.session.prompt('修改节点提示词');
    expect(requests).toHaveLength(4);
    const { version, project } = store.get(p.id);
    expect(version).toBe(2);
    expect(project.nodes[0]?.type === 'media' && project.nodes[0].data.prompt).toBe('新的提示词');
    expect(project.agentEdits).toHaveLength(1);
    const id = project.agentEdits[0]?.id;
    expect(output.activities?.at(-1)).toMatchObject({
      transactionId: id,
      changes: [{ label: '提示词', before: '', after: '新的提示词' }],
    });
    expect(recorded).toEqual([
      {
        id,
        pack: 'canvas',
        projectId: p.id,
        summary: '已修改画布',
        inverse: expect.any(Array),
        afterRevision: graphRevision(project),
      },
    ]);
    // The recorded inverse restores the project as it was before the round.
    const undone = await store.applyOps(p.id, 2, recorded[0]?.inverse, { touch: false });
    expect({ ...undone.project, updatedAt: 0 }).toEqual({ ...before, updatedAt: 0 });
    expect(runtime.session.getLastAssistantText()).toContain('保存回执');
  } finally {
    runtime.session.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('an edit is refused once the graph changed after it was read; settings changes do not count', async () => {
  const p = createProject();
  p.nodes.push({
    id: 'image-a',
    type: 'media',
    position: { x: 0, y: 0 },
    data: createMedia('image'),
  });
  const store = new ProjectStore(test.info().outputPath('projects'));
  await store.initialize();
  await store.create(storedForm(p).project);
  const output: ChatMessage = { id: randomUUID(), role: 'assistant', text: '', status: 'running' };
  const pack = canvasPack(
    {
      owner: -1,
      sessionId: randomUUID(),
      runId: randomUUID(),
      output,
      changed: () => {},
      record: () => {},
    },
    { projectId: p.id, selectedIds: [] },
    { store, broker: new CanvasBroker(), focusOwner: () => undefined },
  );
  const call = (name: string, input: unknown) =>
    pack.tools
      .find((t) => t.name === name)
      ?.execute('id', input as never, undefined, undefined, {} as never);
  await call('get_canvas_summary', {});
  await call('get_node_details', { nodeIds: ['image-a'] });
  // The user pans the canvas: a new version, same graph, so the edit still lands.
  await store.applyOps(p.id, 1, [
    { kind: 'set_project', patch: { viewport: { x: 5, y: 5, zoom: 2 } } },
  ]);
  await call('edit_canvas', {
    operations: [{ kind: 'update_node', nodeId: 'image-a', patch: { prompt: 'a' } }],
  });
  expect(store.get(p.id).version).toBe(3);
  // The user moves the node: the round stops writing.
  await store.applyOps(p.id, 3, [
    { kind: 'move_node', nodeId: 'image-a', position: { x: 50, y: 50 } },
  ]);
  await expect(
    call('edit_canvas', {
      operations: [{ kind: 'update_node', nodeId: 'image-a', patch: { prompt: 'b' } }],
    }),
  ).rejects.toThrow('画布已变化');
  await expect(
    call('edit_canvas', {
      operations: [{ kind: 'update_node', nodeId: 'image-a', patch: { prompt: 'c' } }],
    }),
  ).rejects.toThrow('画布已变化');
  expect(store.get(p.id).version).toBe(4);
  const focus = await call('focus_nodes', { nodeIds: ['image-a'] });
  expect(JSON.stringify(focus)).toContain('没有显示在窗口中');
});
