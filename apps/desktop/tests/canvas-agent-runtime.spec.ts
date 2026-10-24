import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { openAgent } from '../src/main/agent/runtime';
import { CanvasBroker } from '../src/main/agent/canvas-broker';
import { canvasTools } from '../src/main/agent/canvas-tools';
import { canvasSnapshot } from '../src/renderer/src/features/creation/canvas-context';
import { prepareCanvasEdit } from '../src/renderer/src/features/creation/canvas-transactions';
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
  let p = createProject();
  p.nodes.push({
    id: 'image-a',
    type: 'media',
    position: { x: 0, y: 0 },
    data: createMedia('image'),
  });
  const runId = randomUUID(),
    broker = new CanvasBroker();
  broker.dispatch = (_owner, command) => {
    void (async () => {
      expect(broker.claim(1, command.requestId)).toBe(true);
      const result = await prepareCanvasEdit(p, command);
      p = result.project;
      broker.complete(1, {
        requestId: command.requestId,
        projectId: p.id,
        ok: true,
        snapshot: await canvasSnapshot(p, []),
        transactionId: result.transactionId,
        nodeIds: result.nodeIds,
      });
    })();
  };
  const output: ChatMessage = { id: randomUUID(), role: 'assistant', text: '', status: 'running' };
  const tools = canvasTools(
    await canvasSnapshot(p, ['image-a']),
    broker,
    1,
    runId,
    output,
    () => {},
  );
  const runtime = await openAgent(
    test.info().outputPath('runtime'),
    randomUUID(),
    relayModel({ baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'mock' }),
    false,
    { tools, context: 'Current canvas only.' },
  );
  try {
    expect(runtime.session.getActiveToolNames().sort()).toEqual(tools.map((t) => t.name).sort());
    await runtime.session.prompt('修改节点提示词');
    expect(requests).toHaveLength(4);
    expect(p.nodes[0]?.type === 'media' && p.nodes[0].data.prompt).toBe('新的提示词');
    expect(p.agentEdits).toHaveLength(1);
    expect(output.activities?.at(-1)?.transactionId).toBe(p.agentEdits[0]?.id);
    expect(runtime.session.getLastAssistantText()).toContain('保存回执');
  } finally {
    runtime.session.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
