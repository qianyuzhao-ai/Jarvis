import { defaultHandlers } from 'mdast-util-to-markdown';
export const writingTextHandler: typeof defaultHandlers.text = (node, parent, state, info) =>
  defaultHandlers
    .text(node, parent, state, info)
    .replace(/\\\[(\\?\[)/g, '[[')
    .replace(/\\\](\\?\])/g, ']]');
