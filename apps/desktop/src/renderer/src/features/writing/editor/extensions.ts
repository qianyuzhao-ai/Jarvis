import { Plugin } from '@tiptap/pm/state';
import { Mapping } from '@tiptap/pm/transform';
import { Extension, Node, getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';

const Document = Node.create({
  name: 'doc',
  topNode: true,
  content: 'block+',
  addAttributes: () => ({ trailing: { default: '', rendered: false } }),
});
const RawBlock = Node.create({
  name: 'rawBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ raw: { default: '' }, kind: { default: '原文' } }),
  parseHTML: () => [{ tag: 'div[data-raw-block]' }],
  renderHTML: ({ node }) => [
    'div',
    { 'data-raw-block': '', class: 'writing-raw-block', contenteditable: 'false' },
    ['small', {}, `${node.attrs.kind} · 在源码中编辑`],
    ['pre', {}, node.attrs.raw],
  ],
});
const Source = Extension.create({
  name: 'source',
  addProseMirrorPlugins: () => [
    new Plugin({
      appendTransaction(transactions, old, state) {
        if (!transactions.some((tr) => tr.docChanged)) return null;
        const seen = new Set<string>(),
          tr = state.tr;
        const mapping = new Mapping(
          transactions.flatMap((transaction) => transaction.mapping.maps),
        );
        const origins = new Map<number, Record<string, unknown>>();
        const occupied = new Set<string>();
        state.doc.forEach((node) => {
          if (node.attrs.blockId) occupied.add(node.attrs.blockId);
        });
        old.doc.forEach((node, position) => {
          origins.set(mapping.map(position, -1), node.attrs);
        });
        state.doc.forEach((node, position) => {
          let id: string | null = node.attrs.blockId;
          if (!id || seen.has(id)) {
            const origin = !id ? origins.get(position) : undefined;
            const originalId = typeof origin?.blockId === 'string' ? origin.blockId : null;
            id = originalId && !occupied.has(originalId) ? originalId : crypto.randomUUID();
            tr.setNodeMarkup(position, undefined, {
              ...node.attrs,
              ...(origin
                ? { leading: origin.leading, source: origin.source, sourceHash: origin.sourceHash }
                : {}),
              blockId: id,
            });
          }
          seen.add(id);
        });
        return tr.docChanged ? tr.setMeta('addToHistory', false) : null;
      },
    }),
  ],
  addGlobalAttributes: () => [
    {
      types: [
        'paragraph',
        'heading',
        'blockquote',
        'bulletList',
        'orderedList',
        'taskList',
        'listItem',
        'taskItem',
        'codeBlock',
        'horizontalRule',
        'table',
        'image',
        'rawBlock',
      ],
      attributes: Object.fromEntries(
        ['source', 'sourceHash', 'leading', 'blockId'].map((key) => [
          key,
          { default: null, rendered: false },
        ]),
      ),
    },
  ],
});
export function writingExtensions(resolveImage: (source: string) => string = (source) => source) {
  return [
    Document,
    StarterKit.configure({
      document: false,
      trailingNode: false,
      underline: false,
      link: { openOnClick: false },
      undoRedo: { depth: 100, newGroupDelay: 500 },
    }),
    Table.configure({ resizable: false }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.extend({
      renderHTML: ({ HTMLAttributes }) => [
        'img',
        { ...HTMLAttributes, src: resolveImage(HTMLAttributes.src) },
      ],
    }).configure({ allowBase64: false }),
    RawBlock,
    Source,
  ];
}
export const writingSchema = getSchema(writingExtensions());
