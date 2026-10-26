import type { Project } from './types';

type Graph = Pick<Project, 'nodes' | 'edges'>;

export function copyGraph(graph: Graph, offset: { x: number; y: number }): Graph {
  const ids = new Map(graph.nodes.map((node) => [node.id, crypto.randomUUID()]));
  const nodes = graph.nodes.map((node) => {
    const copy = structuredClone(node);
    copy.id = ids.get(node.id)!;
    copy.position = { x: node.position.x + offset.x, y: node.position.y + offset.y };
    if (copy.type === 'media') {
      delete copy.data.generation;
      for (const reference of copy.data.references) reference.id = crypto.randomUUID();
    }
    if (copy.type === 'asset' && copy.data.upload.status === 'uploading') {
      copy.data.upload = { status: 'failed', error: '原素材尚未上传完成，请重新导入' };
    }
    return copy;
  });
  const edges = graph.edges.map((edge) => ({
    id: crypto.randomUUID(),
    source: ids.get(edge.source) ?? edge.source,
    target: ids.get(edge.target) ?? edge.target,
  }));
  return { nodes, edges };
}
