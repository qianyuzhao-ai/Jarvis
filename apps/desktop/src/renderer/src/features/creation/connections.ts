import { httpUrl, REFERENCE_LIMITS } from '../../../../shared/generation';
import type { MediaData, Project } from './types';
import { acceptsSource, connectionIssue } from '../../../../shared/canvas-graph';

type Link = Project['edges'][number];
export type LinkedReference = { nodeId: string; kind: 'image' | 'video' | 'audio'; url: string };
export { acceptsSource, connectionIssue };
export function connectSelected(
  project: Project,
  sourceIds: string[],
  target: string,
): {
  project: Project;
  issue: string | null;
} {
  let next = project;
  for (const source of sourceIds) {
    const issue = connectionIssue(next, { source, target });
    if (issue) return { project, issue };
    next = {
      ...next,
      edges: [...next.edges, { id: crypto.randomUUID(), source, target }],
    };
  }
  return { project: next, issue: null };
}
export function relatedWorkflow(edges: Link[], selected: string | null) {
  const nodes = new Set<string>();
  const links = new Set<string>();
  if (!selected) return { nodes, links };
  nodes.add(selected);
  for (const edge of edges) {
    if (edge.source !== selected && edge.target !== selected) continue;
    links.add(edge.id);
    nodes.add(edge.source);
    nodes.add(edge.target);
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
