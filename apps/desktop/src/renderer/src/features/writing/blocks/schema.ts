import { Node } from '@tiptap/core';
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes: () => ({
    tone: { default: 'note' },
    emoji: { default: '💡' },
    title: { default: '' },
  }),
  parseHTML: () => [{ tag: 'aside[data-callout]' }],
  renderHTML: () => ['aside', { 'data-callout': '' }, 0],
});
export const ToggleBlock = Node.create({
  name: 'toggleBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes: () => ({ summary: { default: '点击展开' } }),
  parseHTML: () => [{ tag: 'div[data-writing-toggle]' }],
  renderHTML: () => ['div', { 'data-writing-toggle': '' }, 0],
});
export function diagramNode(name: 'mermaid' | 'mindMap') {
  return Node.create({
    name,
    group: 'block',
    atom: true,
    selectable: true,
    addAttributes: () => ({ code: { default: '' } }),
    parseHTML: () => [{ tag: `div[data-writing-${name.toLowerCase()}]` }],
    renderHTML: ({ node }) => [
      'div',
      { [`data-writing-${name.toLowerCase()}`]: '' },
      ['pre', {}, node.attrs.code],
    ],
  });
}
export const MermaidBlock = diagramNode('mermaid');
export const MindMapBlock = diagramNode('mindMap');
