import { canvasSnapshotSchema, type CanvasSnapshot } from './canvas-agent';
import { mediaName, type MediaCore } from './canvas-media';
import { REFERENCE_LIMITS } from './generation';

/**
 * The parts of a canvas project that connection rules and Agent snapshots read. Both the
 * renderer's projects (reference files as Blobs) and stored projects (reference metadata) fit.
 */
export type GraphNode = { id: string; position: { x: number; y: number } } & (
  | {
      type: 'media';
      data: MediaCore & {
        references: readonly { type: 'image' | 'video' | 'audio' }[];
        generation?: { status: string };
      };
    }
  | {
      type: 'asset';
      data: { kind: 'image' | 'video' | 'audio'; name: string; upload: { status: string } };
    }
);
export type Graph = {
  nodes: readonly GraphNode[];
  edges: readonly { source: string; target: string }[];
};

export function acceptsSource(source: GraphNode, target: GraphNode) {
  return target.type === 'media' && (target.data.kind === 'video' || source.data.kind === 'image');
}
export function connectionIssue(
  project: Graph,
  connection: { source: string; target: string },
): string | null {
  const { source, target } = connection;
  if (source === target) return '节点不能连接自身';
  const from = project.nodes.find((n) => n.id === source);
  const to = project.nodes.find((n) => n.id === target);
  if (!from || !to) return '连接节点已不存在';
  if (!acceptsSource(from, to))
    return '图像节点仅接收图像；视频节点可接收图像、视频和音频；上传资源不能作为输入目标';
  if (project.edges.some((e) => e.source === source && e.target === target))
    return '这两个节点已连接';
  const reachable = new Set([target]);
  const queue = [target];
  for (let index = 0; index < queue.length; index++) {
    for (const edge of project.edges) {
      if (edge.source !== queue[index] || reachable.has(edge.target)) continue;
      if (edge.target === source) return '不能创建循环连接';
      reachable.add(edge.target);
      queue.push(edge.target);
    }
  }
  if (to.type === 'media') {
    const kind = from.data.kind;
    const count =
      to.data.references.filter((r) => r.type === kind).length +
      project.edges.filter(
        (e) =>
          e.target === target && project.nodes.find((n) => n.id === e.source)?.data.kind === kind,
      ).length;
    if (count >= REFERENCE_LIMITS[kind])
      return `${{ image: '图片', video: '视频', audio: '音频' }[kind]}参考最多 ${REFERENCE_LIMITS[kind]} 个（含面板素材和连线）`;
  }
  return null;
}

/** What the canvas Agent sees of a project: structure and settings, no media or URLs. */
export function snapshotOf(
  project: Graph & { id: string; name: string },
  selectedIds: readonly string[],
  revision: string,
): CanvasSnapshot {
  const snapshot = canvasSnapshotSchema.parse({
    projectId: project.id,
    name: project.name,
    revision,
    selectedIds: selectedIds.filter((id) => project.nodes.some((n) => n.id === id)),
    nodes: project.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      kind: n.data.kind,
      name: n.type === 'media' ? mediaName(n.data) : n.data.name,
      x: n.position.x,
      y: n.position.y,
      ...(n.type === 'media'
        ? {
            prompt: n.data.prompt,
            model: n.data.model,
            size: n.data.size,
            resolution: n.data.resolution,
            quality: n.data.quality,
            duration: n.data.duration,
            generateAudio: n.data.generateAudio,
          }
        : {}),
      status: n.type === 'media' ? (n.data.generation?.status ?? 'idle') : n.data.upload.status,
      referenceCount: n.type === 'media' ? n.data.references.length : 0,
    })),
    edges: project.edges.map(({ source, target }) => ({ source, target })),
  });
  if (JSON.stringify(snapshot).length > 250000) throw new Error('画布内容较多，请精简后重试');
  return snapshot;
}
