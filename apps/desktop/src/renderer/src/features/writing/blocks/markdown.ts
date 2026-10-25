import type { JSONContent } from '@tiptap/core';
import type { Ast } from '../editor/markdown/ast';
export function calloutMarker(attrs: Record<string, unknown>) {
  const tone = String(attrs.tone ?? 'note');
  const marker = tone === 'custom' ? `CALLOUT ${attrs.emoji ?? '💡'}` : tone.toUpperCase();
  return `[!${marker}]${attrs.title ? ' ' + String(attrs.title).replace(/[\r\n]/g, ' ') : ''}`;
}
export const escapeSummary = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const decodeSummary = (value: string) =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
export function richFromAst(
  node: Ast,
  source: string,
  children: (source: string) => JSONContent[],
): JSONContent | null {
  if (node.type === 'code' && ['mermaid', 'mindmap'].includes(node.lang ?? ''))
    return {
      type: node.lang === 'mermaid' ? 'mermaid' : 'mindMap',
      attrs: { code: node.value ?? '' },
    };
  if (node.type === 'blockquote') {
    const body = source.replace(/^ {0,3}> ?/gm, '').replace(/\r\n/g, '\n');
    const match =
      /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|CALLOUT(?: ([^\]]+))?)\](?:[ \t]+([^\n]*))?(?:\n|$)/i.exec(
        body,
      );
    if (match)
      return {
        type: 'callout',
        attrs: {
          tone: match[1]!.toLowerCase().startsWith('callout') ? 'custom' : match[1]!.toLowerCase(),
          emoji: match[2] ?? '💡',
          title: match[3] ?? '',
        },
        content: children(body.slice(match[0].length)),
      };
  }
  const details =
    /^<details(?: open)?><summary>([^\n]*?)<\/summary>\r?\n([\s\S]*)\r?\n<\/details>$/.exec(source);
  if (details)
    return {
      type: 'toggleBlock',
      attrs: { summary: decodeSummary(details[1]!) },
      content: children(details[2]!.replace(/^\r?\n/, '').replace(/\r?\n$/, '')),
    };
  return null;
}
/** Only the fixed details/summary structure is consumed; arbitrary HTML stays a raw block. */
export function detailsEnd(markdown: string, from: number): number | null {
  if (!/^<details(?: open)?><summary>[^\n]*<\/summary>(?:\r?\n)/.test(markdown.slice(from)))
    return null;
  let depth = 0,
    fence = '',
    cursor = from;
  for (const line of markdown.slice(from).split('\n')) {
    const clean = line.replace(/\r$/, ''),
      mark = /^\s*(`{3,}|~{3,})/.exec(clean)?.[1];
    if (mark) {
      if (!fence) fence = mark;
      else if (mark[0] === fence[0] && mark.length >= fence.length) fence = '';
    }
    if (!fence) {
      if (/^<details(?: open)?>/.test(clean)) depth++;
      if (clean === '</details>' && --depth === 0) return cursor + clean.length;
    }
    cursor += line.length + 1;
  }
  return null;
}
