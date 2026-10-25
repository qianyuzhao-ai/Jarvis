import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { applyProjectOps } from '../src/main/projects/apply-ops';
import { ProjectMigration } from '../src/main/projects/migration';
import { ProjectConflictError, ProjectStore } from '../src/main/projects/project-store';
import {
  storedProjectSchema,
  type ProjectChange,
  type ProjectResult,
  type ProjectsBridge,
  type StoredProject,
} from '../src/shared/project';
import { diffProjects } from '../src/shared/project-diff';
import {
  migrationForm,
  projectFromStored,
  storedForm,
} from '../src/renderer/src/features/creation/project-records';
import { ProjectSync } from '../src/renderer/src/features/creation/project-sync';
import {
  createMedia,
  createProject,
  type Project,
} from '../src/renderer/src/features/creation/types';

const sorted = (p: StoredProject) => ({
  ...p,
  nodes: [...p.nodes].sort((a, b) => a.id.localeCompare(b.id)),
  edges: [...p.edges].sort((a, b) => a.id.localeCompare(b.id)),
});
function reference(id: string = randomUUID(), text = 'png') {
  return {
    id,
    name: `${id}.png`,
    type: 'image' as const,
    blob: new Blob([text], { type: 'image/png' }),
  };
}
function sample(): Project {
  const p = createProject();
  return {
    ...p,
    name: '分镜',
    nodes: [
      {
        id: 'a',
        type: 'media',
        position: { x: 0, y: 0 },
        data: { ...createMedia('image'), references: [reference()] },
      },
      { id: 'b', type: 'media', position: { x: 300, y: 0 }, data: createMedia('video') },
      {
        id: 'c',
        type: 'asset',
        position: { x: 0, y: 300 },
        data: {
          kind: 'audio',
          name: 'a.mp3',
          upload: { status: 'ready', url: 'https://x.invalid/a.mp3' },
        },
      },
    ],
    edges: [{ id: 'e1', source: 'a', target: 'b' }],
  };
}

test('diffs replay to the same project across random edits', () => {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)] as T;
  let current = storedForm(sample()).project;
  for (let round = 0; round < 300; round++) {
    const next = structuredClone(current);
    for (let step = 0; step < 1 + Math.floor(random() * 4); step++) {
      const action = Math.floor(random() * 9);
      const node = next.nodes.length ? pick(next.nodes) : undefined;
      if (action === 0 || !node) {
        const id = `n${round}-${step}`;
        next.nodes.push({
          id,
          type: 'media',
          position: { x: round, y: step },
          data: { ...createMedia(random() > 0.5 ? 'image' : 'video'), references: [] },
        });
      } else if (action === 1) {
        next.nodes = next.nodes.filter((n) => n !== node);
        next.edges = next.edges.filter((e) => e.source !== node.id && e.target !== node.id);
      } else if (action === 2 && node.type === 'media') {
        node.data.prompt = `提示词 ${round}`;
        if (random() > 0.5) delete node.data.name;
        else node.data.result = { requestId: `r${round}`, url: 'https://x.invalid/r.png' };
      } else if (action === 3) node.position = { x: random() * 1000, y: random() * 1000 };
      else if (action === 4 && next.nodes.length > 1) {
        const target = pick(next.nodes);
        if (target.id !== node.id)
          next.edges.push({ id: `e${round}-${step}`, source: node.id, target: target.id });
      } else if (action === 5 && next.edges.length)
        next.edges = next.edges.filter((e) => e !== pick(next.edges));
      else if (action === 6) {
        // Same ID, different kind of node.
        next.nodes = next.nodes.map((n) =>
          n === node
            ? n.type === 'asset'
              ? { ...n, type: 'media', data: { ...createMedia('image'), references: [] } }
              : {
                  ...n,
                  type: 'asset',
                  data: { kind: 'image', name: 'x.png', upload: { status: 'uploading' } },
                }
            : n,
        );
      } else if (action === 7) {
        next.name = `项目 ${round}`;
        next.viewport = { x: round, y: -round, zoom: 1 + random() };
        next.snap = random() > 0.5;
      } else if (action === 8 && next.edges.length) {
        // Same edge ID pointing elsewhere.
        const edge = pick(next.edges);
        const target = pick(next.nodes);
        if (target.id !== edge.source) edge.target = target.id;
      }
    }
    const ops = diffProjects(current, next);
    const replayed = applyProjectOps(current, ops).project;
    expect(sorted(replayed)).toEqual(sorted(next));
    expect(storedProjectSchema.safeParse(replayed).success).toBe(true);
    expect(diffProjects(next, replayed)).toEqual([]);
    current = next;
  }
});

test('renderer projects convert to the stored form and back, references included', async () => {
  const project = sample();
  project.agentEdits = [
    {
      id: randomUUID(),
      runId: randomUUID(),
      createdAt: 1,
      before: { nodes: project.nodes.slice(0, 1), edges: [] },
      afterRevision: 'r',
      nodeIds: ['a'],
    },
  ];
  const { project: stored, blobs } = storedForm(project);
  expect(storedProjectSchema.safeParse(stored).success).toBe(true);
  const ref = project.nodes[0]?.type === 'media' ? project.nodes[0].data.references[0] : undefined;
  if (!ref) throw new Error('Missing reference');
  expect(stored.nodes[0]).toMatchObject({
    data: { references: [{ id: ref.id, mimeType: 'image/png', size: 3 }] },
  });
  expect([...blobs.keys()]).toEqual([ref.id]);
  const reads: string[] = [];
  const back = await projectFromStored(stored, async (id) => {
    reads.push(id);
    return new Uint8Array(await (blobs.get(id) as Blob).arrayBuffer());
  });
  expect(reads).toEqual([ref.id]);
  const backRef = back.nodes[0]?.type === 'media' ? back.nodes[0].data.references[0] : undefined;
  expect(await backRef?.blob.text()).toBe('png');
  expect(backRef?.blob.type).toBe('image/png');
  expect(storedForm(back).project).toEqual(stored);
});

test('migration keeps content while fixing IDs and dangling edges', () => {
  const project = sample();
  const legacy = {
    ...project,
    id: 'legacy-project',
    nodes: [
      ...project.nodes,
      project.nodes[1] as Project['nodes'][number],
      {
        ...(project.nodes[0] as Project['nodes'][number]),
        id: 'd',
        data: { ...createMedia('image'), references: [{ ...reference('bad id!'), name: 'x.png' }] },
      },
    ],
    edges: [
      ...project.edges,
      { id: 'e1', source: 'a', target: 'c' },
      { id: 'e2', source: 'a', target: 'gone' },
    ],
  } as Project;
  const fixed = migrationForm(legacy);
  expect(fixed.id).not.toBe('legacy-project');
  expect(fixed.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
  expect(fixed.edges).toEqual([{ id: 'e1', source: 'a', target: 'b' }]);
  const refs = fixed.nodes[3]?.type === 'media' ? fixed.nodes[3].data.references : [];
  expect(refs[0]?.id).not.toBe('bad id!');
  expect(refs[0]?.name).toBe('x.png');
  expect(storedProjectSchema.safeParse(storedForm(fixed).project).success).toBe(true);
  const kept = migrationForm(project);
  expect(kept.id).toBe(project.id);
  expect(storedForm(kept).project).toEqual(storedForm(project).project);
});

function bridgeFor(store: ProjectStore) {
  const calls: string[] = [];
  const listeners: ((change: ProjectChange) => void)[] = [];
  store.onChange = (change) => {
    for (const listener of listeners) listener(change);
  };
  const wrap = async <T>(name: string, action: () => Promise<T> | T): Promise<ProjectResult<T>> => {
    calls.push(name);
    try {
      return { ok: true, value: await action() };
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message,
        ...(error instanceof ProjectConflictError ? { code: 'CONFLICT' as const } : {}),
      };
    }
  };
  const bridge: ProjectsBridge = {
    migrated: () => wrap('migrated', () => true),
    migrate: () => wrap('migrate', () => undefined),
    list: () => wrap('list', () => store.list().map((p) => store.get(p.id))),
    get: (id) => wrap('get', () => store.get(id)),
    readBlob: ({ projectId, id }) =>
      wrap('readBlob', async () => new Uint8Array(await store.readBlob(projectId, id))),
    putBlob: ({ projectId, id, bytes }) =>
      wrap('putBlob', () => store.putBlob(projectId, id, bytes)),
    create: ({ project, blobs, source }) =>
      wrap('create', async () => {
        const map = new Map((blobs ?? []).map((b) => [b.id, b.bytes]));
        return (await store.create(project, map, source)).version;
      }),
    apply: ({ projectId, baseVersion, ops, source }) =>
      wrap(
        'apply',
        async () =>
          (await store.applyOps(projectId, baseVersion, ops, { touch: false, source })).version,
      ),
    remove: ({ projectId, source }) => wrap('remove', () => store.remove(projectId, source)),
    onChange: (listener) => {
      listeners.push(listener);
      return () => {};
    },
  };
  return { bridge, calls };
}

test('the window saves differences, collapses rapid edits, holds drags and reloads on conflict', async () => {
  const store = new ProjectStore(test.info().outputPath('projects'));
  await store.initialize();
  const { bridge, calls } = bridgeFor(store);
  let projects: Project[] = [];
  const sync = new ProjectSync(bridge, [], () => projects);
  const remote: (string | null)[] = [];
  sync.onRemote = (id, project) => {
    remote.push(project ? project.name : null);
    projects = project
      ? projects.map((p) => (p.id === id ? project : p))
      : projects.filter((p) => p.id !== id);
  };
  bridge.onChange((change) => sync.receive(change));
  const set = async (next: Project[]) => {
    const before = projects;
    projects = next;
    await sync.sync(before, next);
  };
  const project = sample();
  await set([project]);
  expect(store.get(project.id).version).toBe(1);
  const ref = project.nodes[0]?.type === 'media' ? project.nodes[0].data.references[0] : undefined;
  expect(await store.readBlob(project.id, ref?.id ?? '')).toEqual(Buffer.from('png'));

  // Ten quick edits: each save starts from the latest state, so later ones find nothing left.
  calls.length = 0;
  const edits: Promise<void>[] = [];
  for (let i = 0; i < 10; i++) {
    const before = projects;
    projects = projects.map((p) => ({ ...p, name: `名称 ${i}`, updatedAt: i }));
    edits.push(sync.sync(before, projects));
  }
  await Promise.all(edits);
  expect(calls.filter((c) => c === 'apply').length).toBeLessThan(10);
  expect(store.get(project.id).project.name).toBe('名称 9');

  // A drag sends nothing until it ends, then one save with the final position.
  calls.length = 0;
  sync.hold(project.id, true);
  for (let x = 0; x < 20; x++)
    await set(
      projects.map((p) => ({
        ...p,
        nodes: p.nodes.map((n) => (n.id === 'b' ? { ...n, position: { x, y: x } } : n)),
      })),
    );
  expect(calls).toEqual([]);
  await sync.hold(project.id, false);
  expect(calls).toEqual(['apply']);
  expect(store.get(project.id).project.nodes.find((n) => n.id === 'b')?.position).toEqual({
    x: 19,
    y: 19,
  });

  // A new reference file is stored before the op that points to it.
  calls.length = 0;
  const added = reference(randomUUID(), 'new');
  await set(
    projects.map((p) => ({
      ...p,
      nodes: p.nodes.map((n) =>
        n.id === 'b' && n.type === 'media' ? { ...n, data: { ...n.data, references: [added] } } : n,
      ),
    })),
  );
  expect(calls).toEqual(['putBlob', 'apply']);
  expect(await store.readBlob(project.id, added.id)).toEqual(Buffer.from('new'));

  // Another writer saved first: the window reloads the latest project and reports it.
  const version = store.get(project.id).version;
  await store.applyOps(
    project.id,
    version,
    [{ kind: 'set_project', patch: { name: '别处修改' } }],
    { source: randomUUID() },
  );
  await expect.poll(() => remote.at(-1)).toBe('别处修改');
  expect(projects[0]?.name).toBe('别处修改');
  // Its own saves are not echoed back.
  const echoes = remote.length;
  await set(projects.map((p) => ({ ...p, dots: false })));
  expect(remote.length).toBe(echoes);
  // A save racing a newer version conflicts, reloads and says so.
  const now = store.get(project.id).version;
  const racing = store.applyOps(
    project.id,
    now,
    [{ kind: 'set_project', patch: { snap: false } }],
    { source: randomUUID() },
  );
  const local = set(projects.map((p) => ({ ...p, minimap: true })));
  await racing;
  await local.catch((error: Error) => expect(error.message).toContain('已载入最新内容'));
  await expect.poll(() => projects[0]?.snap).toBe(false);

  await set([]);
  expect(store.list()).toEqual([]);
});

test('migration copies projects once, verifies them on disk and redoes an interrupted attempt', async () => {
  const dir = test.info().outputPath('projects');
  const store = new ProjectStore(dir);
  await store.initialize();
  const migration = new ProjectMigration(store, dir);
  const project = sample();
  const { project: stored, blobs } = storedForm(project);
  const files = await Promise.all(
    [...blobs].map(async ([id, blob]) => ({ id, bytes: new Uint8Array(await blob.arrayBuffer()) })),
  );
  // An earlier attempt stopped after writing a different copy and before the marker.
  await store.create({ ...stored, name: '半途', nodes: [], edges: [], agentEdits: [] });
  expect(await migration.done()).toBe(false);
  await Promise.all([
    migration.migrate([{ project: stored, blobs: files }]),
    migration.migrate([]),
  ]);
  expect(await migration.done()).toBe(true);
  expect(store.get(project.id)).toEqual({ version: 1, project: stored });
  // Once done it never runs again, even with other input.
  await migration.migrate([{ project: { ...stored, name: '不会写入' }, blobs: files }]);
  expect(store.get(project.id).project.name).toBe('分镜');

  const other = test.info().outputPath('other');
  const fresh = new ProjectStore(other);
  await fresh.initialize();
  const failing = new ProjectMigration(fresh, other);
  await expect(
    failing.migrate([{ project: storedForm(sample()).project, blobs: [] }]),
  ).rejects.toThrow('参考文件缺失');
  expect(await failing.done()).toBe(false);
});
