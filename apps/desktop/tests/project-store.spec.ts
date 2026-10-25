import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ProjectConflictError, ProjectStore } from '../src/main/projects/project-store';
import { createMedia, createProject } from '../src/renderer/src/features/creation/types';
import {
  projectOpsSchema,
  storedProjectSchema,
  type ProjectOp,
  type StoredNode,
  type StoredProject,
} from '../src/shared/project';

function project(): StoredProject {
  return {
    id: randomUUID(),
    name: '分镜',
    updatedAt: 1,
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    minimap: false,
    dots: true,
    snap: true,
    agentEdits: [],
  };
}
function media(id: string, references: string[] = []): StoredNode {
  return {
    id,
    type: 'media',
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      name: '图像生成',
      prompt: '',
      model: 'm',
      size: '16:9',
      resolution: '2K',
      quality: 'medium',
      duration: 5,
      generateAudio: true,
      references: references.map((ref) => ({
        id: ref,
        name: `${ref}.png`,
        type: 'image' as const,
        mimeType: 'image/png',
        size: 3,
      })),
    },
  };
}

test('projects persist one file each, reload after restart and keep reference files', async () => {
  const dir = test.info().outputPath('projects');
  const store = new ProjectStore(dir);
  await store.initialize();
  const p = project();
  const ref = randomUUID();
  expect(
    await store.create(
      { ...p, nodes: [media('a', [ref])] },
      new Map([[ref, new Uint8Array([1, 2, 3])]]),
    ),
  ).toEqual({
    version: 1,
  });
  const changed = await store.applyOps(p.id, 1, [
    { kind: 'add_node', node: media('b') },
    { kind: 'connect', edge: { id: 'e1', source: 'a', target: 'b' } },
    { kind: 'update_node', nodeId: 'b', data: { prompt: '雪山日出' } },
    { kind: 'set_project', patch: { name: '雪山' } },
  ]);
  expect(changed.version).toBe(2);
  const file = JSON.parse(await readFile(join(dir, p.id, 'project.json'), 'utf8'));
  expect(file).toMatchObject({ format: 1, version: 2, project: { name: '雪山' } });

  const reloaded = new ProjectStore(dir);
  expect(await reloaded.initialize()).toEqual({ skipped: [] });
  const { version, project: read } = reloaded.get(p.id);
  expect(version).toBe(2);
  expect(read.edges).toEqual([{ id: 'e1', source: 'a', target: 'b' }]);
  expect(read.nodes.find((n) => n.id === 'b')?.data).toMatchObject({ prompt: '雪山日出' });
  expect([...(await reloaded.readBlob(p.id, ref))]).toEqual([1, 2, 3]);
  expect(reloaded.list()).toEqual([
    { id: p.id, name: '雪山', updatedAt: read.updatedAt, version: 2 },
  ]);

  await reloaded.remove(p.id);
  expect(() => reloaded.get(p.id)).toThrow('项目不存在');
  const again = new ProjectStore(dir);
  await again.initialize();
  expect(again.list()).toEqual([]);
});

test('unreadable or mismatched files are skipped and left untouched; leftovers are ignored', async () => {
  const dir = test.info().outputPath('projects');
  const store = new ProjectStore(dir);
  await store.initialize();
  const good = project();
  await store.create(good);
  // An interrupted write leaves only a temporary file next to the intact one.
  await writeFile(join(dir, good.id, 'project.json.123.tmp'), '{"format":1');
  const broken = randomUUID();
  await mkdir(join(dir, broken));
  await writeFile(join(dir, broken, 'project.json'), '{"format":1,"version":1,"project":{}}');
  const moved = randomUUID();
  await mkdir(join(dir, moved));
  await writeFile(
    join(dir, moved, 'project.json'),
    JSON.stringify({ format: 1, version: 1, project: project() }),
  );
  await mkdir(join(dir, 'not-a-project'));
  const reloaded = new ProjectStore(dir);
  const { skipped } = await reloaded.initialize();
  expect(skipped.sort()).toEqual([broken, moved].sort());
  expect(reloaded.list().map((p) => p.id)).toEqual([good.id]);
  expect(await readFile(join(dir, broken, 'project.json'), 'utf8')).toBe(
    '{"format":1,"version":1,"project":{}}',
  );
});

test('stale versions conflict; invalid results and missing references change nothing', async () => {
  const store = new ProjectStore(test.info().outputPath('projects'));
  await store.initialize();
  const p = project();
  await store.create({ ...p, nodes: [media('a')] });
  const changes: number[] = [];
  store.onChange = (c) => changes.push(c.version);
  await store.applyOps(p.id, 1, [{ kind: 'move_node', nodeId: 'a', position: { x: 5, y: 6 } }]);
  const stale = store.applyOps(p.id, 1, [{ kind: 'remove_node', nodeId: 'a' }]);
  await expect(stale).rejects.toBeInstanceOf(ProjectConflictError);
  await expect(stale).rejects.toMatchObject({ version: 2 });

  const rejected: [unknown, string][] = [
    [[{ kind: 'update_node', nodeId: 'a', data: { kind: 'audio' } }], 'Invalid'],
    [[{ kind: 'update_node', nodeId: 'a', unset: ['prompt'] }], 'Invalid'],
    [[{ kind: 'connect', edge: { id: 'e', source: 'a', target: 'missing' } }], '节点不存在'],
    [[{ kind: 'add_node', node: media('a') }], '节点 ID 已存在'],
    [[{ kind: 'add_node', node: media('b', [randomUUID()]) }], '参考文件缺失'],
    [[{ kind: 'disconnect', edgeId: 'none' }], '连线不存在'],
    [[], 'Too small'],
  ];
  // An own `__proto__` key, as it would arrive over IPC, is dropped instead of merged.
  const [polluted] = projectOpsSchema.parse(
    JSON.parse('[{"kind":"update_node","nodeId":"a","data":{"__proto__":{"x":1}}}]'),
  );
  expect(polluted?.kind === 'update_node' && Object.keys(polluted.data)).toEqual([]);
  for (const [ops, message] of rejected)
    await expect(store.applyOps(p.id, 2, ops)).rejects.toThrow(message);
  expect(store.get(p.id)).toMatchObject({
    version: 2,
    project: { nodes: [{ position: { x: 5, y: 6 } }] },
  });
  expect(changes).toEqual([2]);
  await expect(
    store.applyOps(randomUUID(), 1, [{ kind: 'remove_node', nodeId: 'a' }]),
  ).rejects.toThrow('项目不存在');
  await expect(store.readBlob(p.id, '../x')).rejects.toThrow('参考文件不存在');
  await expect(store.putBlob(p.id, '../x', new Uint8Array())).rejects.toThrow('参考文件标识不正确');
});

test('inverse ops restore the previous project exactly', async () => {
  const store = new ProjectStore(test.info().outputPath('projects'));
  await store.initialize();
  const p = project();
  const ref = randomUUID();
  await store.create(
    {
      ...p,
      nodes: [media('a'), media('b', [ref])],
      edges: [{ id: 'e', source: 'a', target: 'b' }],
    },
    new Map([[ref, new Uint8Array([9])]]),
  );
  const before = store.get(p.id).project;
  const ops: ProjectOp[] = [
    { kind: 'update_node', nodeId: 'a', data: { prompt: '新', name: '开场' }, unset: ['name'] },
    {
      kind: 'update_node',
      nodeId: 'a',
      data: { result: { requestId: 'r', url: 'https://x/y.png' } },
      unset: [],
    },
    { kind: 'move_node', nodeId: 'a', position: { x: 10, y: 20 } },
    { kind: 'remove_node', nodeId: 'b' },
    { kind: 'add_node', node: media('c') },
    { kind: 'connect', edge: { id: 'e2', source: 'a', target: 'c' } },
    { kind: 'set_project', patch: { viewport: { x: 1, y: 2, zoom: 2 }, snap: false } },
  ];
  const done = await store.applyOps(p.id, 1, ops, { touch: false });
  expect(done.project.nodes.map((n) => n.id)).toEqual(['a', 'c']);
  const undone = await store.applyOps(p.id, 2, done.inverse, { touch: false });
  expect(undone.version).toBe(3);
  expect(undone.project).toEqual(before);
});

test('writes to one project run in order, other projects are not held up', async () => {
  const store = new ProjectStore(test.info().outputPath('projects'));
  await store.initialize();
  const p = project();
  const q = project();
  await store.create({ ...p, nodes: [media('a')] });
  await store.create(q);
  // Twenty writers on the same base: exactly one wins, the rest conflict at version 2.
  const racing = await Promise.allSettled(
    Array.from({ length: 20 }, (_, i) =>
      store.applyOps(p.id, 1, [{ kind: 'move_node', nodeId: 'a', position: { x: i, y: i } }]),
    ),
  );
  expect(racing.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    racing.every(
      (r) =>
        r.status === 'fulfilled' ||
        (r.reason instanceof ProjectConflictError && r.reason.version === 2),
    ),
  ).toBe(true);
  // Chained writers that each build on the previous version all land, in call order.
  const chained = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      store.applyOps(p.id, 2 + i, [{ kind: 'add_node', node: media(`n${i}`) }]),
    ),
  );
  expect(chained.map((r) => r.version)).toEqual(Array.from({ length: 10 }, (_, i) => 3 + i));
  const parallel = await Promise.all([
    store.applyOps(q.id, 1, [{ kind: 'set_project', patch: { name: 'Q' } }]),
    store.applyOps(p.id, 12, [{ kind: 'set_project', patch: { name: 'P' } }]),
  ]);
  expect(parallel.map((r) => r.version)).toEqual([2, 13]);
  const reloaded = new ProjectStore(test.info().outputPath('projects'));
  await reloaded.initialize();
  expect(reloaded.get(p.id).version).toBe(13);
  expect(reloaded.get(p.id).project.nodes).toHaveLength(11);
  expect(reloaded.get(q.id).project.name).toBe('Q');
});

test('projects as the canvas creates them today fit the stored schema once blobs move out', () => {
  const current = createProject();
  const node = {
    id: 'n1',
    type: 'media' as const,
    position: { x: 1, y: 2 },
    data: createMedia('video'),
  };
  const asset = {
    id: 'n2',
    type: 'asset' as const,
    position: { x: 3, y: 4 },
    data: { kind: 'audio' as const, name: 'a.mp3', upload: { status: 'uploading' as const } },
  };
  expect(
    storedProjectSchema.safeParse({ ...current, nodes: [node, asset], edges: [] }).success,
  ).toBe(true);
});
