import type { ProjectOp, StoredProject } from '../../shared/project';

/**
 * Applies ops to a copy of the project and returns it with the ops that undo them, in the order
 * they must run. Throws on an op that does not fit the project; the caller validates the result.
 */
export function applyProjectOps(project: StoredProject, ops: ProjectOp[]) {
  const next = structuredClone(project);
  const undo: ProjectOp[][] = [];
  const node = (id: string) => {
    const found = next.nodes.find((n) => n.id === id);
    if (!found) throw new Error(`节点不存在：${id}`);
    return found;
  };
  for (const op of ops) {
    switch (op.kind) {
      case 'add_node':
        if (next.nodes.some((n) => n.id === op.node.id))
          throw new Error(`节点 ID 已存在：${op.node.id}`);
        next.nodes.push(structuredClone(op.node));
        undo.push([{ kind: 'remove_node', nodeId: op.node.id }]);
        break;
      case 'update_node': {
        const target = node(op.nodeId);
        const data = target.data as Record<string, unknown>;
        const restore: Record<string, unknown> = {};
        const absent: string[] = [];
        for (const key of new Set([...Object.keys(op.data), ...op.unset]))
          if (key in data) restore[key] = structuredClone(data[key]);
          else absent.push(key);
        Object.assign(data, structuredClone(op.data));
        for (const key of op.unset) delete data[key];
        undo.push([{ kind: 'update_node', nodeId: op.nodeId, data: restore, unset: absent }]);
        break;
      }
      case 'move_node': {
        const target = node(op.nodeId);
        undo.push([{ kind: 'move_node', nodeId: op.nodeId, position: { ...target.position } }]);
        target.position = { ...op.position };
        break;
      }
      case 'remove_node': {
        const target = node(op.nodeId);
        const edges = next.edges.filter((e) => e.source === op.nodeId || e.target === op.nodeId);
        next.nodes = next.nodes.filter((n) => n !== target);
        next.edges = next.edges.filter((e) => !edges.includes(e));
        undo.push([
          { kind: 'add_node', node: target },
          ...edges.map((edge) => ({ kind: 'connect' as const, edge })),
        ]);
        break;
      }
      case 'connect':
        if (next.edges.some((e) => e.id === op.edge.id))
          throw new Error(`连线 ID 已存在：${op.edge.id}`);
        node(op.edge.source);
        node(op.edge.target);
        next.edges.push({ ...op.edge });
        undo.push([{ kind: 'disconnect', edgeId: op.edge.id }]);
        break;
      case 'disconnect': {
        const edge = next.edges.find((e) => e.id === op.edgeId);
        if (!edge) throw new Error(`连线不存在：${op.edgeId}`);
        next.edges = next.edges.filter((e) => e !== edge);
        undo.push([{ kind: 'connect', edge }]);
        break;
      }
      case 'set_project': {
        const before: Extract<ProjectOp, { kind: 'set_project' }>['patch'] = {};
        for (const key of Object.keys(op.patch) as (keyof typeof op.patch)[])
          Object.assign(before, { [key]: structuredClone(next[key]) });
        Object.assign(next, structuredClone(op.patch));
        undo.push([{ kind: 'set_project', patch: before }]);
        break;
      }
      case 'set_agent_edits':
        undo.push([{ kind: 'set_agent_edits', agentEdits: next.agentEdits }]);
        next.agentEdits = structuredClone(op.agentEdits);
        break;
    }
  }
  return { project: next, inverse: undo.reverse().flat() };
}
