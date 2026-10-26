import { posix } from 'node:path';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import { writingLinks } from '../../shared/writing-links';
import type { GraphDot, GraphLink } from '../../shared/writing-graph';

type Ast = {
  type: string;
  value?: string;
  url?: string;
  identifier?: string;
  children?: Ast[];
  position?: { start: { offset: number }; end: { offset: number } };
};
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkFrontmatter, ['yaml', 'toml']);
export function markdownMetadata(content: string) {
  const tree = parser.parse(content) as Ast;
  const ignored: { from: number; to: number }[] = [];
  const collect = (node: Ast) => {
    if (
      ['code', 'inlineCode', 'html', 'yaml', 'toml', 'definition'].includes(node.type) &&
      node.position
    )
      ignored.push({ from: node.position.start.offset, to: node.position.end.offset });
    for (const child of node.children ?? []) collect(child);
  };
  collect(tree);
  const references = writingLinks(content).filter(
    (ref) => !ignored.some((range) => ref.from >= range.from && ref.from < range.to),
  );
  const text = (node: Ast): string =>
    ['code', 'html', 'definition', 'yaml', 'toml'].includes(node.type)
      ? ''
      : (node.value ?? (node.children ?? []).map(text).join(node.type === 'root' ? ' ' : ''));
  const refs: Pick<GraphLink, 'kind' | 'reference' | 'from' | 'to' | 'context'>[] = references
    .filter((r) => r.kind === 'wiki')
    .map((r) => ({
      kind: 'wiki',
      reference: r.target,
      from: r.from,
      to: r.to,
      context: content.slice(Math.max(0, r.from - 40), r.to + 80).slice(0, 120),
    }));
  const definitions = new Map<string, string>();
  const visit = (node: Ast, fn: (n: Ast) => void) => {
    fn(node);
    for (const child of node.children ?? []) visit(child, fn);
  };
  visit(tree, (n) => {
    if (n.type === 'definition' && n.identifier && n.url) definitions.set(n.identifier, n.url);
  });
  visit(tree, (n) => {
    const url = n.url ?? (n.identifier ? definitions.get(n.identifier) : undefined);
    if (
      !['link', 'image', 'linkReference', 'imageReference'].includes(n.type) ||
      !url ||
      /^(?:[a-z][\w+.-]*:|\/|#)/i.test(url) ||
      !n.position
    )
      return;
    const from = n.position.start.offset,
      to = n.position.end.offset;
    refs.push({
      kind: 'relative',
      reference: url,
      from,
      to,
      context: content.slice(Math.max(0, from - 40), to + 80).slice(0, 120),
    });
  });
  return {
    title: text(tree.children?.find((n) => n.type === 'heading') ?? { type: 'text', value: '' }),
    summary: text(tree)
      .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200),
    tags: [...new Set(references.filter((r) => r.kind === 'tag').map((r) => r.target))],
    refs,
  };
}
export function resolveReference(
  dots: GraphDot[],
  source: string,
  reference: string,
  kind: GraphLink['kind'],
) {
  const clean = reference.split('#')[0]!.split('?')[0]!;
  let target: string;
  try {
    target = decodeURIComponent(clean);
  } catch {
    return null;
  }
  if (!target || target.includes('\\') || target.includes('\0') || target.startsWith('/'))
    return null;
  const stem = (path: string) => path.replace(/\.(md|markdown)$/i, '');
  const relative = posix.normalize(posix.join(posix.dirname(source), target));
  if (kind === 'relative')
    return !relative.startsWith('../')
      ? (dots.find((d) => d.path === relative)?.path ?? null)
      : null;
  const candidates = dots.filter(
    (d) =>
      d.path === target ||
      stem(d.path) === stem(target) ||
      d.path === relative ||
      stem(d.path) === stem(relative) ||
      (!target.includes('/') && stem(d.name) === stem(target)),
  );
  return (
    candidates.sort(
      (a, b) =>
        Number(posix.dirname(b.path) === posix.dirname(source)) -
          Number(posix.dirname(a.path) === posix.dirname(source)) ||
        a.path.length - b.path.length ||
        a.path.localeCompare(b.path),
    )[0]?.path ?? null
  );
}

export function associationOffset(content: string) {
  const tree = parser.parse(content) as Ast;
  let found = false;
  for (const node of tree.children ?? []) {
    if (node.type !== 'heading') continue;
    const raw = content.slice(node.position?.start.offset, node.position?.end.offset);
    if (!/^#{1,2}\s/.test(raw)) continue;
    if (found) return node.position!.start.offset;
    if (/^##[ \t]+关联[ \t]*$/.test(raw)) found = true;
  }
  return found ? content.length : null;
}
