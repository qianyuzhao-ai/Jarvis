import { acceptsSource, type Graph } from './canvas-graph';
import { httpUrl, REFERENCE_LIMITS } from './generation';

type Kind = 'image' | 'video' | 'audio';
const names = { image: '图片', audio: '音频', video: '视频' };
export type LinkedReference = { nodeId: string; kind: Kind; url: string };

/** Numbers references per kind (图片 1, 图片 2, 视频 1…), the order prompts refer to them by. */
export function numberReferences<T extends { type: Kind }>(references: readonly T[]) {
  const counts = { image: 0, audio: 0, video: 0 };
  return references.map((item) => {
    const number = ++counts[item.type];
    return { item, number, label: `${names[item.type]} ${number}` };
  });
}
export const mentionPattern = /@(?:image|video|audio)_\d+\b/g;
/** Replaces `@image_1` style mentions with the platform's `<<<image_1>>>` markers. */
export function submittedPrompt(prompt: string, counts: Record<Kind, number>) {
  return prompt.replace(mentionPattern, (token) => {
    const match = /^@(image|video|audio)_(\d+)$/.exec(token);
    if (!match) return token;
    const kind = match[1] as Kind;
    const index = Number(match[2]);
    if (index < 1 || index > counts[kind])
      throw new Error(`${token} 对应的参考素材不存在，请检查引用顺序`);
    return `<<<${kind}_${index}>>>`;
  });
}
/** The finished results of upstream nodes connected into a media node. */
export function linkedReferences(project: Graph, targetId: string): LinkedReference[] {
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
export function validateReferences(
  data: { kind: 'image' | 'video'; references: readonly { type: Kind }[] },
  linked: LinkedReference[],
) {
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
