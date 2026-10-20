import { httpUrl, REFERENCE_LIMITS } from '../../../../shared/generation';
import type { CanvasNode, MediaData, Project } from './types';

type Connection = { source: string; target: string };
type Link = Project['edges'][number];
export type LinkedReference = { nodeId: string; kind: 'image' | 'video' | 'audio'; url: string };
export function acceptsSource(source: CanvasNode, target: CanvasNode) {
  return target.type === 'media' && (target.data.kind === 'video' || source.data.kind === 'image');
}
export function connectionIssue(project: Project, connection: Connection): string | null {
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
export function relatedWorkflow(edges: Link[], selected: string | null) {
  const nodes = new Set<string>();
  const links = new Set<string>();
  if (!selected) return { nodes, links };
  nodes.add(selected);
  for (const direction of ['upstream', 'downstream'] as const) {
    const seen = new Set([selected]);
    const queue = [selected];
    for (let index = 0; index < queue.length; index++) {
      for (const edge of edges) {
        const from = direction === 'upstream' ? edge.target : edge.source;
        const to = direction === 'upstream' ? edge.source : edge.target;
        if (from !== queue[index]) continue;
        links.add(edge.id);
        nodes.add(to);
        if (!seen.has(to)) {
          seen.add(to);
          queue.push(to);
        }
      }
    }
  }
  return { nodes, links };
}
export function linkedReferences(project: Project, targetId: string): LinkedReference[] {
  const target = project.nodes.find((n) => n.id === targetId);
  if (!target || target.type !== 'media') throw new Error('找不到生成节点');
  return project.edges
    .filter((edge) => edge.target === targetId)
    .map((edge) => {
      const source = project.nodes.find((n) => n.id === edge.source);
      if (!source || !acceptsSource(source, target))
        throw new Error('连入的节点不存在或类型不匹配，请检查连线');
      let url: string | undefined;
      if (source.type === 'asset') {
        if (source.data.upload.status === 'ready') url = source.data.upload.url;
      } else if (
        !['uploading', 'submitting', 'running'].includes(source.data.generation?.status ?? '')
      )
        url = source.data.result?.url;
      if (!url || !httpUrl.safeParse(url).success)
        throw new Error('连入的上游节点尚无可用 URL，请先完成上传或生成');
      return { nodeId: source.id, kind: source.data.kind, url };
    });
}
export function validateReferences(data: MediaData, linked: LinkedReference[]) {
  for (const kind of ['image', 'video', 'audio'] as const) {
    const count =
      data.references.filter((r) => r.type === kind).length +
      linked.filter((r) => r.kind === kind).length;
    if (count > REFERENCE_LIMITS[kind] || (data.kind === 'image' && kind !== 'image' && count > 0))
      throw new Error(
        '参考素材超限或类型不匹配（含面板素材和连线）。图像仅接受图片；图片最多 9 张，视频和音频各最多 3 个。',
      );
  }
}
