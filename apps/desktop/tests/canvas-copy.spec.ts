import { expect, test } from '@playwright/test';
import { copyGraph } from '../src/renderer/src/features/creation/copy-graph';
import { createMedia, type MediaNode } from '../src/renderer/src/features/creation/types';

test('copied graphs preserve positions, edge order and assets without sharing running jobs', async () => {
  const nodes: MediaNode[] = [
    { id: 'a', type: 'media', position: { x: 24, y: 48 }, data: createMedia('image') },
    { id: 'b', type: 'media', position: { x: 504, y: 120 }, data: createMedia('video') },
  ];
  nodes[0]!.data.references.push({
    id: 'ref',
    name: 'test.png',
    type: 'image',
    blob: new Blob(['image']),
  });
  nodes[0]!.data.generation = { requestId: 'running-job', status: 'running', startedAt: 1 };
  const edges = [
    { id: 'upstream', source: 'external', target: 'a' },
    { id: 'internal', source: 'a', target: 'b' },
  ];
  const copied = copyGraph({ nodes, edges }, { x: 48, y: 48 });
  expect(copied.nodes.map((n) => n.position)).toEqual([
    { x: 72, y: 96 },
    { x: 552, y: 168 },
  ]);
  expect(copied.edges.map(({ source, target }) => ({ source, target }))).toEqual([
    { source: 'external', target: copied.nodes[0]!.id },
    { source: copied.nodes[0]!.id, target: copied.nodes[1]!.id },
  ]);
  expect(
    new Set([...nodes, ...copied.nodes, ...edges, ...copied.edges].map((n) => n.id)).size,
  ).toBe(8);
  const image = copied.nodes[0]!;
  if (image.type !== 'media') throw new Error('Expected media');
  expect(image.data.generation).toBeUndefined();
  expect(await image.data.references[0]!.blob.text()).toBe('image');
  image.data.prompt = 'new prompt';
  expect(nodes[0]!.data.prompt).toBe('');
  expect(nodes[0]!.data.generation?.status).toBe('running');
});

import {
  captureNodes,
  pasteNodes,
  readCanvasCopy,
  storeCanvasCopy,
} from '../src/renderer/src/features/creation/canvas-clipboard';
import { createProject } from '../src/renderer/src/features/creation/types';

test('single copies keep incoming edges; groups keep only internal edges, with repeatable independent pastes', () => {
  const project = createProject();
  project.nodes = ['a', 'b', 'c'].map((id, index) => ({
    id,
    type: 'media',
    position: { x: index * 400, y: index * 24 },
    data: createMedia('image'),
  }));
  project.edges = [
    { id: 'ab', source: 'a', target: 'b' },
    { id: 'bc', source: 'b', target: 'c' },
  ];
  const single = captureNodes(project, ['b']);
  expect(single.edges).toEqual([project.edges[0]]);
  const duplicate = pasteNodes(project, single);
  expect(duplicate.edges[0]).toMatchObject({ source: 'a', target: duplicate.ids[0] });
  expect(pasteNodes(createProject(), single).edges).toEqual([]);
  expect(
    pasteNodes({ ...project, nodes: project.nodes.filter((n) => n.id !== 'a') }, single)
      .missingEdges,
  ).toBe(1);
  const snapshot = captureNodes(project, ['b', 'c']);
  expect(snapshot.edges).toEqual([project.edges[1]]);
  const token = storeCanvasCopy(snapshot);
  expect(readCanvasCopy('plain text')).toBeNull();
  expect(readCanvasCopy(token)).toEqual(snapshot);
  const first = pasteNodes(project, snapshot);
  const second = pasteNodes({ ...project, nodes: [...project.nodes, ...first.nodes] }, snapshot);
  expect(first.nodes[0]!.position).not.toEqual(second.nodes[0]!.position);
  expect(first.edges[0]).toMatchObject({ source: first.ids[0], target: first.ids[1] });
  expect(second.edges[0]).toMatchObject({ source: second.ids[0], target: second.ids[1] });
  expect(second.nodes[1]!.position.x - second.nodes[0]!.position.x).toBe(400);
  expect(second.nodes[1]!.position.y - second.nodes[0]!.position.y).toBe(24);
});
