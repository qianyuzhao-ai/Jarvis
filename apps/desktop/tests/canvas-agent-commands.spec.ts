import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createMedia, createProject } from '../src/renderer/src/features/creation/types';
import {
  canvasSnapshot,
  graphRevision as graphRevisionOf,
} from '../src/renderer/src/features/creation/canvas-context';
import { prepareCanvasUndo } from '../src/renderer/src/features/creation/canvas-transactions';
import { storedForm } from '../src/renderer/src/features/creation/project-records';
import {
  applyAgentEdit,
  applyCanvasOperations,
  canvasSnapshotOf,
  graphRevision,
} from '../src/main/projects/canvas-engine';
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
  const p = storedForm(project()).project;
  const snapshot = canvasSnapshotOf(p, ['image-a', 'missing']);
  expect(snapshot.selectedIds).toEqual(['image-a']);
  expect(snapshot.nodes[0]?.prompt).toBe('');
  expect(snapshot.revision).toBe(graphRevision(p));
  // The renderer and the main process build the same snapshot apart from the revision.
  const shown = await canvasSnapshot(project(), ['image-a']);
  expect({ ...shown, revision: '', projectId: '' }).toEqual({
    ...snapshot,
    revision: '',
    projectId: '',
  });
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
test('Agent edits group by run with one agentEdits entry and report field changes', () => {
  const p = storedForm(project()).project;
  const runId = randomUUID();
  const first = applyAgentEdit(p, runId, [
    { kind: 'update_node', nodeId: 'image-a', patch: { prompt: 'new' } },
  ]);
  expect(first.changes).toEqual([{ nodeId: 'image-a', label: '提示词', before: '', after: 'new' }]);
  const second = applyAgentEdit(first.project, runId, [
    { kind: 'move_node', nodeId: 'image-a', x: 200, y: 100 },
  ]);
  expect(second.project.agentEdits).toHaveLength(1);
  expect(second.transactionId).toBe(first.transactionId);
  expect(second.project.agentEdits[0]?.before.nodes).toEqual(p.nodes);
  expect(second.project.agentEdits[0]?.afterRevision).toBe(graphRevision(second.project));
  const other = applyAgentEdit(second.project, randomUUID(), [
    { kind: 'update_node', nodeId: 'video-b', patch: { name: '成片' } },
  ]);
  expect(other.project.agentEdits).toHaveLength(2);
  expect(other.transactionId).not.toBe(first.transactionId);
});
test('edits made before the upgrade are still undone by the window that shows the canvas', async () => {
  const p = project();
  const after = {
    ...p,
    nodes: p.nodes.map((n) => (n.id === 'image-a' ? { ...n, position: { x: 9, y: 9 } } : n)),
  };
  const id = randomUUID();
  const legacy = {
    ...after,
    agentEdits: [
      {
        id,
        runId: randomUUID(),
        createdAt: 1,
        before: { nodes: p.nodes, edges: p.edges },
        afterRevision: await graphRevisionOf(after),
        nodeIds: ['image-a'],
      },
    ],
  };
  expect((await prepareCanvasUndo(legacy, id)).nodes).toEqual(p.nodes);
  await expect(prepareCanvasUndo(legacy, randomUUID())).rejects.toThrow('最近一次');
  const manual = {
    ...legacy,
    nodes: legacy.nodes.map((n) => ({ ...n, position: { x: 0, y: 0 } })),
  };
  await expect(prepareCanvasUndo(manual, id)).rejects.toThrow('后续修改');
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
      expectedRevision: graphRevision(storedForm(p).project),
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
