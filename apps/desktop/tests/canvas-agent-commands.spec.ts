import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createMedia, createProject } from '../src/renderer/src/features/creation/types';
import {
  canvasSnapshot,
  graphRevision,
} from '../src/renderer/src/features/creation/canvas-context';
import { applyCanvasOperations } from '../src/renderer/src/features/creation/canvas-commands';
import {
  prepareCanvasEdit,
  prepareCanvasUndo,
} from '../src/renderer/src/features/creation/canvas-transactions';
import { CanvasBroker } from '../src/main/agent/canvas-broker';
import type { CanvasCommand } from '../src/shared/canvas-agent';

function project() {
  const p = createProject();
  p.nodes = [
    { id: 'image-a', type: 'media', position: { x: 0, y: 0 }, data: createMedia('image') },
    {
      id: 'video-b',
      type: 'media',
      position: { x: 500, y: 0 },
      data: { ...createMedia('video'), resolution: '1080p' },
    },
  ];
  return p;
}
test('canvas snapshots omit blobs and URLs; batches validate before any changes', async () => {
  const p = project();
  const snapshot = await canvasSnapshot(p, ['image-a']);
  expect(snapshot.selectedIds).toEqual(['image-a']);
  expect(snapshot.nodes[0]?.prompt).toBe('');
  const before = JSON.stringify(p);
  expect(() =>
    applyCanvasOperations(p, [
      { kind: 'update_node', nodeId: 'image-a', patch: { prompt: 'new' } },
      { kind: 'connect', source: 'missing', target: 'video-b' },
    ]),
  ).toThrow('不存在');
  expect(JSON.stringify(p)).toBe(before);
  expect(() =>
    applyCanvasOperations(p, [
      { kind: 'update_node', nodeId: 'image-a', patch: { model: 'unknown' } },
    ]),
  ).toThrow('模型');
  const linked = applyCanvasOperations(p, [
    { kind: 'connect', source: 'image-a', target: 'video-b' },
  ]).project;
  expect(() =>
    applyCanvasOperations(linked, [{ kind: 'connect', source: 'image-a', target: 'video-b' }]),
  ).toThrow('已连接');
});
test('canvas edits group by run and undo persists; concurrent changes and cross-project edits are rejected', async () => {
  const p = project(),
    runId = randomUUID();
  const command: CanvasCommand = {
    requestId: randomUUID(),
    runId,
    projectId: p.id,
    expectedRevision: await graphRevision(p),
    expiresAt: Date.now() + 1000,
    command: {
      type: 'apply',
      operations: [{ kind: 'update_node', nodeId: 'image-a', patch: { prompt: 'new' } }],
    },
  };
  const first = await prepareCanvasEdit(p, command);
  const second = await prepareCanvasEdit(first.project, {
    ...command,
    expectedRevision: await graphRevision(first.project),
    command: {
      type: 'apply',
      operations: [{ kind: 'move_node', nodeId: 'image-a', x: 200, y: 100 }],
    },
  });
  expect(second.project.agentEdits).toHaveLength(1);
  expect(second.transactionId).toBe(first.transactionId);
  expect((await prepareCanvasUndo(second.project, second.transactionId)).nodes).toEqual(p.nodes);
  await expect(prepareCanvasEdit(second.project, command)).rejects.toThrow('发生修改');
  await expect(prepareCanvasEdit(p, { ...command, projectId: randomUUID() })).rejects.toThrow(
    '发生修改',
  );
  const manual = applyCanvasOperations(second.project, [
    { kind: 'update_node', nodeId: 'image-a', patch: { name: 'manual' } },
  ]).project;
  await expect(prepareCanvasUndo(manual, second.transactionId)).rejects.toThrow('后续修改');
});
test('canvas request claims are owner-bound, one-shot and cancelled commands cannot be claimed', async () => {
  const broker = new CanvasBroker(),
    p = project(),
    controller = new AbortController();
  let command: CanvasCommand | undefined;
  broker.dispatch = (_owner, value) => {
    command = value;
  };
  const pending = broker.request(
    1,
    {
      runId: randomUUID(),
      projectId: p.id,
      expectedRevision: await graphRevision(p),
      command: { type: 'focus', nodeIds: ['image-a'] },
    },
    controller.signal,
  );
  if (!command) throw new Error('Missing dispatched command');
  expect(broker.claim(2, command.requestId)).toBe(false);
  expect(broker.claim(1, command.requestId)).toBe(true);
  expect(broker.claim(1, command.requestId)).toBe(false);
  expect(() =>
    broker.complete(2, { requestId: command?.requestId ?? '', projectId: p.id, ok: true }),
  ).toThrow('失效');
  broker.complete(1, { requestId: command.requestId, projectId: p.id, ok: true });
  expect((await pending).ok).toBe(true);
  const cancelled = broker.request(
    1,
    {
      runId: randomUUID(),
      projectId: p.id,
      expectedRevision: '',
      command: { type: 'focus', nodeIds: ['image-a'] },
    },
    controller.signal,
  );
  controller.abort();
  await expect(cancelled).rejects.toThrow('停止');
  expect(broker.claim(1, command.requestId)).toBe(false);
});
