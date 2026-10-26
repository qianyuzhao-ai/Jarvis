import { richFromAst, detailsEnd } from '../../blocks/markdown';
import { writingTextHandler } from './text-handler';
import type { JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import remarkStringify from 'remark-stringify';
import { writingSchema } from '../extensions';
import { fromAst, toAst, type Ast } from './ast';
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml', 'toml']);
const metadata = new Set(['source', 'sourceHash', 'leading', 'blockId']);
export function fingerprint(node: JSONContent): string {
  return JSON.stringify(node, (key, value) => (metadata.has(key) ? undefined : value));
}
export interface BlockRange {
  id: string;
  from: number;
  to: number;
  position: number;
  size: number;
}
function rawKind(node: Ast, source: string) {
  if (node.type === 'yaml' || node.type === 'toml') return 'Frontmatter';
  if (node.type === 'code' && ['mindmap', 'mermaid'].includes(node.lang ?? '')) return node.lang!;
  if (
    node.type === 'blockquote' &&
    /^>\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION|CALLOUT)/i.test(source)
  )
    return 'callout';
  if (/^<details[\s>]/i.test(source)) return 'toggle';
  const unknown = (n: Ast): boolean =>
    [
      'definition',
      'footnoteDefinition',
      'footnoteReference',
      'html',
      'linkReference',
      'imageReference',
      'math',
      'inlineMath',
    ].includes(n.type) ||
    (n.children?.some(unknown) ?? false);
  return unknown(node) ? '原文' : '';
}
export function parse(markdown: string) {
  const ast = parser.parse(markdown) as Ast;
  let offset = 0;
  const content: JSONContent[] = [];
  const nodes = ast.children ?? [];
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]!;
    const from = node.position?.start.offset ?? offset;
    let to = node.position?.end.offset ?? from;
    const end = detailsEnd(markdown, from);
    if (end !== null) {
      to = end;
      while (index + 1 < nodes.length && (nodes[index + 1]!.position?.start.offset ?? to) < to)
        index++;
    }
    const source = markdown.slice(from, to),
      kind = rawKind(node, source);
    const rich = richFromAst(
      node,
      source,
      (text) => parse(text).doc.toJSON().content as JSONContent[],
    );
    let converted = rich
      ? [rich]
      : kind
        ? [{ type: 'rawBlock', attrs: { raw: source, kind } }]
        : fromAst(node);
    // An inline image cannot live inside a paragraph in the block image schema.
    if (
      converted.length === 1 &&
      converted[0]?.type === 'paragraph' &&
      converted[0].content?.length === 1 &&
      converted[0].content[0]?.type === 'image'
    )
      converted = converted[0].content;
    else if (
      converted.some((n) => n.type === 'paragraph' && n.content?.some((c) => c.type === 'image'))
    )
      converted = [{ type: 'rawBlock', attrs: { raw: source, kind: '图片 Markdown' } }];
    if (!converted.length) converted = [{ type: 'rawBlock', attrs: { raw: source, kind: '原文' } }];
    let normalized: JSONContent;
    try {
      const block = writingSchema.nodeFromJSON(converted[0]!);
      block.check();
      normalized = block.toJSON() as JSONContent;
    } catch {
      normalized = writingSchema.nodes
        .rawBlock!.create({ raw: source, kind: '复杂 Markdown' })
        .toJSON() as JSONContent;
    }
    normalized.attrs = {
      ...normalized.attrs,
      source,
      sourceHash: fingerprint(normalized),
      leading: markdown.slice(offset, from),
      blockId: crypto.randomUUID(),
    };
    content.push(normalized);
    offset = to;
  }
  if (!content.length) {
    const empty = writingSchema.nodes.paragraph!.create().toJSON() as JSONContent;
    empty.attrs = {
      ...empty.attrs,
      source: '',
      sourceHash: fingerprint(empty),
      leading: '',
      blockId: crypto.randomUUID(),
    };
    content.push(empty);
  }
  const doc = writingSchema.nodeFromJSON({
    type: 'doc',
    attrs: { trailing: markdown.slice(offset) },
    content,
  });
  return { doc, blocks: blockRanges(doc) };
}
/**
 * Keeps how the author wrote a list: tight or loose, per list and per item, taken from the
 * block's previous source. Lists without a counterpart stay tight (see `toAst`).
 */
function keepSpread(next: Ast, previous?: Ast) {
  if (
    (next.type === 'list' || next.type === 'listItem') &&
    previous?.type === next.type &&
    typeof previous.spread === 'boolean'
  )
    next.spread = previous.spread;
  next.children?.forEach((child, index) => {
    const counterpart = previous?.children?.[index];
    keepSpread(child, counterpart?.type === child.type ? counterpart : undefined);
  });
}
export function blockText(node: PMNode): string {
  const json = node.toJSON() as JSONContent;
  if (typeof node.attrs.source === 'string' && node.attrs.sourceHash === fingerprint(json))
    return node.attrs.source;
  if (node.type.name === 'rawBlock') return node.attrs.raw;
  const old: string = node.attrs.source ?? '';
  const bullet = /^\s*([*+-])\s/.exec(old)?.[1] as '*' | '+' | '-' | undefined;
  const ordered = /^\s*\d+([.)])\s/.exec(old)?.[1] as '.' | ')' | undefined;
  const fence = /^\s*(~{3,}|`{3,})/.exec(old)?.[1];
  const ast = toAst(json);
  if (ast.type === 'list') keepSpread(ast, (parser.parse(old) as Ast).children?.[0]);
  const firstLine = old.split(/\r?\n/)[0] ?? '';
  const writer = unified()
    .use(remarkGfm)
    .use(remarkStringify, {
      handlers: { text: writingTextHandler },
      bullet: bullet ?? '-',
      bulletOrdered: ordered ?? '.',
      emphasis: /(^|\W)\*[^*]/.test(old) ? '*' : '_',
      strong: old.includes('__') ? '_' : '*',
      fences: true,
      fence: fence?.[0] === '~' ? '~' : '`',
      setext: ast.type === 'heading' && /^\s{0,3}(=+|-+)\s*$/m.test(old.split(/\r?\n/)[1] ?? ''),
      closeAtx: ast.type === 'heading' && /^#{1,6}\s.*\s#+\s*$/.test(firstLine),
    });
  let result = writer
    .stringify({ type: 'root', children: [ast] } as Parameters<typeof writer.stringify>[0])
    .replace(/\n$/, '');
  if (fence && fence.length > 3 && ast.type === 'code')
    result = result.replace(/^(`{3,}|~{3,})/, fence).replace(/(`{3,}|~{3,})$/, fence);
  if (/^\s*(?:[-*+]|\d+[.)])\s+\[X\]/m.test(old))
    result = result.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[x\]/gm, '$1[X]');
  if (old.includes('\r\n')) result = result.replace(/\n/g, '\r\n');
  return result;
}
function leading(node: PMNode, index: number) {
  const value = node.attrs.leading;
  return typeof value === 'string' && (value || !index) ? value : index ? '\n\n' : '';
}
export function serialize(doc: PMNode): string {
  let result = '';
  doc.forEach((node, _position, index) => {
    result += leading(node, index) + blockText(node);
  });
  return result + (doc.attrs.trailing ?? '');
}
export function blockRanges(doc: PMNode): BlockRange[] {
  let from = 0;
  const ranges: BlockRange[] = [];
  doc.forEach((node, position, index) => {
    from += leading(node, index).length;
    const to = from + blockText(node).length;
    ranges.push({
      id: node.attrs.blockId ?? `block-${position}`,
      from,
      to,
      position,
      size: node.nodeSize,
    });
    from = to;
  });
  return ranges;
}
export function textPatch(before: string, after: string) {
  let from = 0,
    end = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  while (
    end < before.length - from &&
    end < after.length - from &&
    before[before.length - end - 1] === after[after.length - end - 1]
  )
    end++;
  return { from, to: before.length - end, text: after.slice(from, after.length - end) };
}
