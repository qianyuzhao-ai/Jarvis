import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { GenerationRunner } from '../src/main/generation/agent-runner';
import { ProjectStore } from '../src/main/projects/project-store';
import { GraphIndex } from '../src/main/writing/graph-index';
import { WritingFiles } from '../src/main/writing/files';
import type { WritingCommand } from '../src/shared/writing-agent';
import { storedForm } from '../src/renderer/src/features/creation/project-records';
import { createMedia, createProject } from '../src/renderer/src/features/creation/types';
import { call, mockModel, promptOf, startOs, toolResults, type MockReply } from './helpers/os';

const isCoordinator = (system: string) => system.includes('协调者（Coordinator）');
const tools = (body: { tools?: { function: { name: string } }[] }) =>
  body.tools?.map((t) => t.function.name) ?? [];

async function canvasStore() {
  const p = createProject();
  p.name = '视觉系统';
  p.nodes.push({
    id: 'image-a',
    type: 'media',
    position: { x: 0, y: 0 },
    data: createMedia('image'),
  });
  const store = new ProjectStore(test.info().outputPath('projects'));
  await store.initialize();
  await store.create(storedForm(p).project);
  return { store, canvasId: p.id };
}

test('a canvas sidebar thread edits the stored canvas it is bound to, sees the selection and undoes', async () => {
  const { store, canvasId } = await canvasStore();
  const before = store.get(canvasId).project;
  const server = await mockModel((body, step): MockReply => {
    const { system } = promptOf(body);
    if (isCoordinator(system)) return { text: '好的。' };
    if (step === 0) return call('get_canvas_summary', {});
    if (step === 1) return call('get_node_details', { nodeIds: ['image-a'] });
    if (step === 2)
      return call('edit_canvas', {
        operations: [{ kind: 'update_node', nodeId: 'image-a', patch: { prompt: '暖色调' } }],
      });
    return { text: '改好了。' };
  });
  const runner = { onFinished: () => {}, pending: () => 0 } as unknown as GenerationRunner;
  const { os, project, idle } = await startOs(test.info().outputPath('agent'), server.url, {
    projects: store,
    generation: runner,
  });
  try {
    const input = {
      target: { kind: 'canvas' as const, canvasId },
      requestId: randomUUID(),
      text: '把选中图片的提示词改成暖色调',
      canvas: { selectedIds: ['image-a'], images: [] },
    };
    const threadId = await os.startSpaceThread(input);
    // A retried request does not start a second thread.
    expect(await os.startSpaceThread(input)).toBe(threadId);
    await idle();
    const thread = project.thread(threadId);
    expect(thread).toMatchObject({
      origin: 'space',
      targets: [{ kind: 'canvas', canvasId }],
      title: '把选中图片的提示词改成暖色调',
    });
    expect(thread.mounts.map((m) => m.pack)).toEqual(['canvas', 'generation']);
    const body = server.bodies.find((b) => !isCoordinator(promptOf(b).system));
    if (!body) throw new Error('no thread request');
    const { system } = promptOf(body);
    expect(system).toContain('工作对象：画布「视觉系统」');
    expect(system).toContain('本次引用节点 image-a');
    expect(system).toContain('右侧栏开启');
    expect(tools(body)).toEqual(
      expect.arrayContaining(['edit_canvas', 'focus_nodes', 'start_generation', 'ask_coordinator']),
    );
    const edited = store.get(canvasId).project.nodes[0];
    expect(edited?.type === 'media' && edited.data.prompt).toBe('暖色调');
    const view = os.session(threadId).session;
    expect(view.messages[0]).toMatchObject({
      role: 'user',
      trust: 'principal',
      canvasReferences: [{ id: 'image-a' }],
    });
    const activity = view.messages.flatMap((m) => m.activities ?? []).find((a) => a.transactionId);
    if (!activity?.transactionId) throw new Error('no undo record');
    await os.undo(activity.transactionId);
    expect({ ...store.get(canvasId).project, updatedAt: 0 }).toMatchObject({
      ...before,
      updatedAt: 0,
      agentEdits: expect.any(Array),
    });
    const node = store.get(canvasId).project.nodes[0];
    expect(node?.type === 'media' && node.data.prompt).toBe('');
    await expect(os.undo(activity.transactionId)).rejects.toThrow('已撤销');
    // Nodes of another canvas are refused, and so are images for a model that cannot read them.
    await expect(
      os.send(threadId, '再看看', { selectedIds: ['missing'], images: [] }),
    ).rejects.toThrow('不属于这个画布');
    // A finished generation wakes the thread with the outcome as data.
    (runner as unknown as { onFinished: (task: unknown) => void }).onFinished({
      requestId: randomUUID(),
      sessionId: threadId,
      projectId: canvasId,
      nodeId: 'image-a',
      delivered: false,
      status: 'succeeded',
      nodeName: '图像 1',
    });
    await expect
      .poll(() => server.bodies.some((b) => promptOf(b).user.includes('外部事件：生成服务')))
      .toBe(true);
    expect(os.session(threadId).session.messages.at(-2)).toMatchObject({
      text: '生成完成：图像 1',
      trust: 'relay',
      source: { kind: 'external' },
    });
    await idle();
  } finally {
    await os.shutdown();
    await server.close();
  }
});

test('a Coordinator thread edits a closed document on disk with version checks, undoes the round and follows renames', async () => {
  const notes = test.info().outputPath('notes');
  await mkdir(notes, { recursive: true });
  await writeFile(join(notes, 'a.md'), '# 周报\n\n第一段\n');
  await writeFile(join(notes, 'b.md'), '# 复盘\n\n先说结论\n');
  const files = new WritingFiles(test.info().outputPath('roots.json'));
  await files.initialize();
  const { id: rootId } = await files.addRoot(notes);
  const graph = new GraphIndex(files, test.info().outputPath('index'));
  let version = '';
  const server = await mockModel((body, step): MockReply => {
    const { system, user } = promptOf(body);
    if (isCoordinator(system)) {
      if (user.includes('线程状态通知')) return { text: '改好了。' };
      if (user.includes('没有目标')) {
        if (step === 0)
          return call('spawn_thread', {
            title: '缺少目标',
            objective: '改文档',
            outputFormat: '回复',
            capabilities: ['writing'],
          });
        return { text: '没开成。' };
      }
      if (step === 0)
        return call('spawn_thread', {
          title: '改写周报开头',
          objective: '把周报第一段改得口语',
          outputFormat: '直接改文档',
          capabilities: ['writing'],
          targets: [{ kind: 'document', rootId, path: 'a.md' }],
        });
      return { text: '交给线程了。' };
    }
    if (user.includes('再读一遍')) {
      if (step === 0) return call('read_document', {});
      return { text: '读完了。' };
    }
    if (step === 0) return call('read_document', {});
    if (step === 1) {
      version = JSON.parse(toolResults(body)[0] ?? '{}').version;
      const text = '# 周报\n\n第一段\n';
      return call('replace_range', {
        from: text.indexOf('第一段'),
        to: text.indexOf('第一段') + 3,
        text: '这周做完了三件事',
        version,
      });
    }
    if (step === 2)
      return call('report_result', {
        status: 'done',
        summary: '开头改好了。',
        resonance: [{ path: 'b.md', reason: '都在讲先说结论' }],
      });
    return { text: '改好了，已保存，可以撤销。' };
  });
  const { os, project, coordinator, idle } = await startOs(
    test.info().outputPath('agent'),
    server.url,
    { files, graph },
  );
  try {
    await os.send(coordinator, '没有目标也改一下文档');
    await idle();
    expect(
      server.bodies.some((b) =>
        toolResults(b).some((r) => r.includes('写能力 writing 需要在 targets 里写明')),
      ),
    ).toBe(true);
    await os.send(coordinator, '把周报开头改口语');
    await idle();
    const thread = project.threads.find((t) => t.title === '改写周报开头');
    if (!thread) throw new Error('no thread');
    expect(thread.targets).toEqual([{ kind: 'document', rootId, path: 'a.md' }]);
    const threadBody = server.bodies.find((b) => tools(b).includes('replace_range'));
    expect(promptOf(threadBody!).system).toContain('修改会直接保存到文件');
    expect(await readFile(join(notes, 'a.md'), 'utf8')).toBe('# 周报\n\n这周做完了三件事\n');
    const activities = os.session(thread.id).session.messages.flatMap((m) => m.activities ?? []);
    expect(activities.find((a) => a.resonance)).toMatchObject({
      label: '发现共鸣点，等待确认',
      resonance: [{ path: 'b.md' }],
    });
    const edit = activities.find((a) => a.transactionId);
    expect(edit?.label).toContain('文档未打开，可撤销');
    const entry = project.ledger.find(edit!.transactionId!);
    expect(entry?.textChanges).toHaveLength(1);
    // Undo is refused once the file changed after the edit, and works while it still matches.
    await writeFile(join(notes, 'a.md'), '# 周报\n\n这周做完了三件事\n用户补的一句\n');
    await expect(os.undo(edit!.transactionId!)).rejects.toThrow('又被改过');
    await writeFile(join(notes, 'a.md'), '# 周报\n\n这周做完了三件事\n');
    await os.undo(edit!.transactionId!);
    expect(await readFile(join(notes, 'a.md'), 'utf8')).toBe('# 周报\n\n第一段\n');
    // Renaming the document moves the thread's target with it.
    await os.relocateWriting(rootId, 'a.md', () => files.rename(rootId, 'a.md', 'c.md'));
    expect(project.thread(thread.id).targets).toEqual([{ kind: 'document', rootId, path: 'c.md' }]);
    // Once a window has the document open, reads go to its editor.
    const commands: WritingCommand[] = [];
    os.spaces.writing.dispatch = (owner, command) => {
      commands.push(command);
      setTimeout(() => {
        os.spaces.writing.claim(owner, command.requestId);
        os.spaces.writing.complete(owner, {
          requestId: command.requestId,
          runId: command.runId,
          scope: command.scope,
          ok: true,
          snapshot: {
            name: 'c.md',
            version: 'a'.repeat(64),
            length: 10,
            from: 0,
            text: '编辑器里的内容',
            next: null,
            selection: { from: 0, to: 0, text: '', truncated: false },
          },
        });
      });
    };
    os.spaces.setTargets(7, { projects: [], documents: [{ rootId, path: 'c.md', name: 'c.md' }] });
    await os.send(thread.id, '再读一遍');
    await idle();
    expect(commands.map((c) => [c.scope.path, c.command.type])).toEqual([['c.md', 'read']]);
  } finally {
    await os.shutdown();
    await server.close();
  }
});

test('threads cannot mount canvas or writing packs without a target', async () => {
  const server = await mockModel((body, step): MockReply => {
    const { system } = promptOf(body);
    if (isCoordinator(system)) {
      if (step === 0)
        return call('spawn_thread', { title: '整理笔记', objective: '整理', outputFormat: '回复' });
      return { text: '好。' };
    }
    if (step === 0) return call('request_capability', { pack: 'canvas', reason: '想改画布' });
    return { text: '没有画布可改。' };
  });
  const { os, coordinator, idle } = await startOs(test.info().outputPath('agent'), server.url);
  try {
    await os.send(coordinator, '整理一下笔记');
    await idle();
    expect(
      server.bodies.some((b) => toolResults(b).some((r) => r.includes('这个线程没有绑定画布'))),
    ).toBe(true);
  } finally {
    await os.shutdown();
    await server.close();
  }
});
