import {
  blobId,
  storedAssetSchema,
  storedMediaSchema,
  storedProjectSchema,
  type StoredNode,
  type StoredProject,
} from '../../../../shared/project';
import type { Project, Reference } from './types';

type Graph = { nodes: Project['nodes']; edges: Project['edges'] };
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const pick = (data: object, keys: string[]) =>
  Object.fromEntries(Object.entries(data).filter(([key]) => keys.includes(key)));
const mediaKeys = Object.keys(storedMediaSchema.shape);
const assetKeys = Object.keys(storedAssetSchema.shape);

/**
 * A project in the main-process format: reference blobs move out to `blobs`, keyed by reference
 * ID, and fields the store does not keep are dropped.
 */
export function storedForm(project: Project) {
  const blobs = new Map<string, Blob>();
  const nodes = (graph: Graph) =>
    graph.nodes.map((node): StoredNode => {
      if (node.type === 'asset')
        return plain({
          id: node.id,
          type: 'asset',
          position: node.position,
          data: pick(node.data, assetKeys),
        }) as StoredNode;
      const references = node.data.references.map((r: Reference) => {
        blobs.set(r.id, r.blob);
        return {
          id: r.id,
          name: r.name,
          type: r.type,
          mimeType: r.blob.type,
          size: r.blob.size,
          ...(r.uploadedUrl === undefined ? {} : { uploadedUrl: r.uploadedUrl }),
          ...(r.uploadedFor === undefined ? {} : { uploadedFor: r.uploadedFor }),
        };
      });
      return plain({
        id: node.id,
        type: 'media',
        position: node.position,
        data: { ...pick(node.data, mediaKeys), references },
      }) as StoredNode;
    });
  const stored: StoredProject = {
    id: project.id,
    name: project.name,
    updatedAt: project.updatedAt,
    nodes: nodes(project),
    edges: plain(project.edges.map(({ id, source, target }) => ({ id, source, target }))),
    viewport: plain(project.viewport),
    minimap: project.minimap,
    dots: project.dots,
    snap: project.snap,
    agentEdits: project.agentEdits.map((edit) => ({
      ...plain({ ...edit, before: undefined }),
      before: {
        nodes: nodes(edit.before),
        edges: plain(edit.before.edges.map(({ id, source, target }) => ({ id, source, target }))),
      },
    })),
  };
  return { project: stored, blobs };
}

/** Rebuilds the renderer's project, reading each reference file once. */
export async function projectFromStored(
  stored: StoredProject,
  readBlob: (id: string) => Promise<Uint8Array>,
): Promise<Project> {
  const files = new Map<string, Blob>();
  const blob = async (ref: { id: string; mimeType: string }) => {
    let file = files.get(ref.id);
    if (!file) {
      file = new Blob([new Uint8Array(await readBlob(ref.id))], { type: ref.mimeType });
      files.set(ref.id, file);
    }
    return file;
  };
  const nodes = (graph: StoredProject['agentEdits'][number]['before']) =>
    Promise.all(
      graph.nodes.map(async (node): Promise<Project['nodes'][number]> => {
        if (node.type === 'asset') return structuredClone(node);
        const references = await Promise.all(
          node.data.references.map(async ({ mimeType: _, size: __, ...ref }) => ({
            ...ref,
            blob: await blob({ id: ref.id, mimeType: _ }),
          })),
        );
        return { ...structuredClone(node), data: { ...structuredClone(node.data), references } };
      }),
    );
  return {
    ...structuredClone(stored),
    nodes: await nodes(stored),
    agentEdits: await Promise.all(
      stored.agentEdits.map(async (edit) => ({
        ...structuredClone(edit),
        before: { nodes: await nodes(edit.before), edges: structuredClone(edit.before.edges) },
      })),
    ),
  };
}

/**
 * Makes an IndexedDB project fit the stored format before migration without losing content:
 * a non-UUID project ID or an unusable reference ID gets a new one, repeated node and edge IDs
 * keep their first entry, and edges to missing nodes are dropped.
 */
export function migrationForm(project: Project): Project {
  const renamed = new Map<string, string>();
  const graph = <T extends Graph>(value: T): T => {
    const seen = new Set<string>();
    const nodes = value.nodes.filter((n) => !seen.has(n.id) && seen.add(n.id));
    const edgeIds = new Set<string>();
    const edges = value.edges.filter(
      (e) => seen.has(e.source) && seen.has(e.target) && !edgeIds.has(e.id) && edgeIds.add(e.id),
    );
    return {
      ...value,
      edges,
      nodes: nodes.map((node) =>
        node.type === 'asset'
          ? node
          : {
              ...node,
              data: {
                ...node.data,
                references: node.data.references.map((r) => {
                  if (blobId.safeParse(r.id).success) return r;
                  const id = renamed.get(r.id) ?? crypto.randomUUID();
                  renamed.set(r.id, id);
                  return { ...r, id };
                }),
              },
            },
      ),
    };
  };
  return {
    ...graph(project),
    id: storedProjectSchema.shape.id.safeParse(project.id).success
      ? project.id
      : crypto.randomUUID(),
    name: project.name.slice(0, 200),
    agentEdits: project.agentEdits.map((edit) => ({ ...edit, before: graph(edit.before) })),
  };
}
