import type { ProjectOp, StoredEdge, StoredNode, StoredProject } from './project';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The ops that turn `before` into `after`: disconnections and removals first, then additions,
 * field updates, moves, new connections and project settings. Node and edge order is not kept.
 */
export function diffProjects(before: StoredProject, after: StoredProject): ProjectOp[] {
  const ops: ProjectOp[] = [];
  const oldNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const newNodes = new Map(after.nodes.map((n) => [n.id, n]));
  // A node whose type changed is removed and added again.
  const replaced = new Set(
    after.nodes
      .filter((n) => oldNodes.has(n.id) && oldNodes.get(n.id)?.type !== n.type)
      .map((n) => n.id),
  );
  const removed = new Set(
    before.nodes.filter((n) => !newNodes.has(n.id) || replaced.has(n.id)).map((n) => n.id),
  );
  const newEdges = new Map(after.edges.map((e) => [e.id, e]));
  const oldEdges = new Map(before.edges.map((e) => [e.id, e]));
  // Edges of removed nodes go with them; other changed or dropped edges are disconnected.
  const kept = (e: StoredEdge) => !removed.has(e.source) && !removed.has(e.target);
  for (const edge of before.edges)
    if (kept(edge) && !same(newEdges.get(edge.id), edge))
      ops.push({ kind: 'disconnect', edgeId: edge.id });
  for (const id of removed) ops.push({ kind: 'remove_node', nodeId: id });
  for (const node of after.nodes) {
    const old = oldNodes.get(node.id);
    if (!old || replaced.has(node.id)) {
      ops.push({ kind: 'add_node', node });
      continue;
    }
    const patch = dataPatch(old, node);
    if (patch) ops.push({ kind: 'update_node', nodeId: node.id, ...patch });
    if (!same(old.position, node.position))
      ops.push({ kind: 'move_node', nodeId: node.id, position: node.position });
  }
  for (const edge of after.edges) {
    const old = oldEdges.get(edge.id);
    if (!old || !same(old, edge) || !kept(old)) ops.push({ kind: 'connect', edge });
  }
  const patch: Extract<ProjectOp, { kind: 'set_project' }>['patch'] = {};
  for (const key of ['name', 'updatedAt', 'viewport', 'minimap', 'dots', 'snap'] as const)
    if (!same(before[key], after[key])) Object.assign(patch, { [key]: after[key] });
  if (Object.keys(patch).length) ops.push({ kind: 'set_project', patch });
  if (!same(before.agentEdits, after.agentEdits))
    ops.push({ kind: 'set_agent_edits', agentEdits: after.agentEdits });
  return ops;
}

function dataPatch(before: StoredNode, after: StoredNode) {
  const a = before.data as Record<string, unknown>;
  const b = after.data as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const key of Object.keys(b)) if (!same(a[key], b[key])) data[key] = b[key];
  for (const key of Object.keys(a)) if (!(key in b)) unset.push(key);
  return Object.keys(data).length || unset.length ? { data, unset } : null;
}
