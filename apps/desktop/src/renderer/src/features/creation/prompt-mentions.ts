import type { Project, MediaNode, Reference } from './types';

const names = { image: '图片', video: '视频', audio: '音频' };
export type PromptMention = {
  token: string;
  label: string;
  name: string;
};

export function promptMentions(project: Project, node: MediaNode): PromptMention[] {
  const counts = { image: 0, video: 0, audio: 0 };
  const mentions: PromptMention[] = [];
  function add(kind: keyof typeof counts, name: string) {
    const index = ++counts[kind];
    mentions.push({ token: `@${kind}_${index}`, label: `${names[kind]} ${index}`, name });
  }
  for (const reference of node.data.references) add(reference.type, reference.name);
  const urls = {
    image: new Set(
      node.data.references.filter((r) => r.type === 'image').map((r) => r.uploadedUrl),
    ),
    video: new Set(
      node.data.references.filter((r) => r.type === 'video').map((r) => r.uploadedUrl),
    ),
    audio: new Set(
      node.data.references.filter((r) => r.type === 'audio').map((r) => r.uploadedUrl),
    ),
  };
  for (const edge of project.edges) {
    if (edge.target !== node.id) continue;
    const source = project.nodes.find((item) => item.id === edge.source);
    if (!source) continue;
    const kind = source.data.kind;
    const url =
      source.type === 'asset'
        ? source.data.upload.status === 'ready'
          ? source.data.upload.url
          : undefined
        : source.data.result?.url;
    if (url && urls[kind].has(url)) continue;
    if (url) urls[kind].add(url);
    add(kind, source.type === 'asset' ? source.data.name : `连线${names[kind]}节点`);
  }
  return mentions;
}

const mentionPattern = /@(?:image|video|audio)_\d+\b/g;
export function rebaseLocalMentions(prompt: string, before: Reference[], after: Reference[]) {
  return prompt.replace(mentionPattern, (token) => {
    const match = /^@(image|video|audio)_(\d+)$/.exec(token);
    if (!match) return token;
    const kind = match[1] as Reference['type'];
    const index = Number(match[2]);
    const previous = before.filter((item) => item.type === kind);
    const next = after.filter((item) => item.type === kind);
    if (index <= previous.length) {
      const id = previous[index - 1]?.id;
      const newIndex = next.findIndex((item) => item.id === id);
      return newIndex < 0 ? '' : `@${kind}_${newIndex + 1}`;
    }
    return `@${kind}_${index + next.length - previous.length}`;
  });
}
export function submittedPrompt(
  prompt: string,
  counts: Record<'image' | 'video' | 'audio', number>,
) {
  return prompt.replace(mentionPattern, (token) => {
    const match = /^@(image|video|audio)_(\d+)$/.exec(token);
    if (!match) return token;
    const kind = match[1] as keyof typeof counts;
    const index = Number(match[2]);
    if (index < 1 || index > counts[kind])
      throw new Error(`${token} 对应的参考素材不存在，请检查引用顺序`);
    return `<<<${kind}_${index}>>>`;
  });
}
