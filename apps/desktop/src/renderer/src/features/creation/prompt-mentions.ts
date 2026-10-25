import { mentionPattern, submittedPrompt } from '../../../../shared/generation-refs';
import { mediaName, type Project, type MediaNode, type Reference } from './types';

const names = { image: '图片', video: '视频', audio: '音频' };
export type PromptMention = {
  token: string;
  label: string;
  name: string;
  kind: Reference['type'];
  url?: string;
  blob?: Blob;
};

export function promptMentions(project: Project, node: MediaNode): PromptMention[] {
  const counts = { image: 0, video: 0, audio: 0 };
  const mentions: PromptMention[] = [];
  function add(kind: keyof typeof counts, name: string, url?: string, blob?: Blob) {
    const index = ++counts[kind];
    mentions.push({
      token: `@${kind}_${index}`,
      label: `${names[kind]} ${index}`,
      name,
      kind,
      url,
      blob,
    });
  }
  for (const reference of node.data.references)
    add(reference.type, reference.name, reference.uploadedUrl, reference.blob);
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
    add(kind, source.type === 'asset' ? source.data.name : mediaName(source.data), url);
  }
  return mentions;
}

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
export { submittedPrompt };
