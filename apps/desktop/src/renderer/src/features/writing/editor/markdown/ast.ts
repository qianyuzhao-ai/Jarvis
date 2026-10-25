import type { JSONContent } from '@tiptap/core';
export interface Ast {
  type: string;
  value?: string;
  children?: Ast[];
  depth?: number;
  ordered?: boolean;
  start?: number | null;
  checked?: boolean | null;
  lang?: string | null;
  url?: string;
  title?: string | null;
  alt?: string | null;
  align?: (string | null)[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}
const leaf = (
  type: string,
  attrs?: JSONContent['attrs'],
  content?: JSONContent[],
): JSONContent => ({ type, ...(attrs ? { attrs } : {}), ...(content?.length ? { content } : {}) });
export function fromAst(node: Ast, marks: NonNullable<JSONContent['marks']> = []): JSONContent[] {
  const children = () => (node.children ?? []).flatMap((n) => fromAst(n, marks));
  const mark = {
    strong: 'bold',
    emphasis: 'italic',
    delete: 'strike',
    inlineCode: 'code',
    link: 'link',
  }[node.type];
  if (mark) {
    const next = [
      ...marks,
      {
        type: mark,
        ...(mark === 'link' ? { attrs: { href: node.url, title: node.title ?? null } } : {}),
      },
    ];
    return node.type === 'inlineCode'
      ? [{ type: 'text', text: node.value || ' ', marks: next }]
      : (node.children ?? []).flatMap((n) => fromAst(n, next));
  }
  switch (node.type) {
    case 'text':
      return node.value
        ? [{ type: 'text', text: node.value, ...(marks.length ? { marks } : {}) }]
        : [];
    case 'paragraph':
      return [leaf('paragraph', undefined, children())];
    case 'heading':
      return [leaf('heading', { level: node.depth }, children())];
    case 'blockquote':
      return [leaf('blockquote', undefined, children())];
    case 'list': {
      const task = node.children?.some((n) => typeof n.checked === 'boolean');
      return [
        leaf(
          task ? 'taskList' : node.ordered ? 'orderedList' : 'bulletList',
          node.ordered ? { start: node.start ?? 1 } : undefined,
          (node.children ?? []).map((item) =>
            leaf(
              task ? 'taskItem' : 'listItem',
              task ? { checked: !!item.checked } : undefined,
              (item.children ?? []).flatMap((n) => fromAst(n)),
            ),
          ),
        ),
      ];
    }
    case 'code':
      return [
        leaf(
          'codeBlock',
          { language: node.lang ?? null },
          node.value ? [{ type: 'text', text: node.value }] : [],
        ),
      ];
    case 'thematicBreak':
      return [leaf('horizontalRule')];
    case 'break':
      return [leaf('hardBreak')];
    case 'image':
      return [leaf('image', { src: node.url, alt: node.alt ?? '', title: node.title ?? null })];
    case 'table':
      return [
        leaf(
          'table',
          undefined,
          (node.children ?? []).map((row, index) =>
            leaf(
              'tableRow',
              undefined,
              (row.children ?? []).map((cell) =>
                leaf(index === 0 ? 'tableHeader' : 'tableCell', undefined, [
                  leaf(
                    'paragraph',
                    undefined,
                    (cell.children ?? []).flatMap((n) => fromAst(n)),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ];
    default:
      return [];
  }
}
export function toAst(node: JSONContent): Ast {
  const children = () => (node.content ?? []).map(toAst);
  if (node.type === 'text') {
    let result: Ast = { type: 'text', value: node.text ?? '' };
    for (const mark of node.marks ?? []) {
      const type = {
        bold: 'strong',
        italic: 'emphasis',
        strike: 'delete',
        code: 'inlineCode',
        link: 'link',
      }[mark.type];
      if (!type) continue;
      result =
        type === 'inlineCode'
          ? { type, value: node.text ?? '' }
          : {
              type,
              children: [result],
              ...(type === 'link' ? { url: mark.attrs?.href, title: mark.attrs?.title } : {}),
            };
    }
    return result;
  }
  switch (node.type) {
    case 'heading':
      return { type: 'heading', depth: node.attrs?.level ?? 1, children: children() };
    case 'paragraph':
    case 'blockquote':
      return { type: node.type, children: children() };
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return {
        type: 'list',
        ordered: node.type === 'orderedList',
        start: node.attrs?.start ?? 1,
        children: children(),
      };
    case 'listItem':
    case 'taskItem':
      return {
        type: 'listItem',
        ...(node.type === 'taskItem' ? { checked: !!node.attrs?.checked } : {}),
        children: children(),
      };
    case 'codeBlock':
      return {
        type: 'code',
        lang: node.attrs?.language,
        value: (node.content ?? []).map((n) => n.text ?? '').join(''),
      };
    case 'horizontalRule':
      return { type: 'thematicBreak' };
    case 'hardBreak':
      return { type: 'break' };
    case 'image':
      return {
        type: 'image',
        url: node.attrs?.src,
        alt: node.attrs?.alt,
        title: node.attrs?.title,
      };
    case 'table':
      return {
        type: 'table',
        align: (node.content?.[0]?.content ?? []).map(() => null),
        children: children(),
      };
    case 'tableRow':
      return { type: 'tableRow', children: children() };
    case 'tableCell':
    case 'tableHeader':
      return {
        type: 'tableCell',
        children: (node.content ?? []).flatMap((n) => n.content ?? []).map(toAst),
      };
    default:
      return { type: 'html', value: node.attrs?.raw ?? '' };
  }
}
