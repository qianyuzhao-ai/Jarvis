import { syntaxTree } from '@codemirror/language';
import { StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { Range } from '@codemirror/state';
import type { SyntaxNodeRef } from '@lezer/common';

export interface Heading {
  from: number;
  level: number;
  title: string;
}
export function headings(state: EditorState): Heading[] {
  const result: Heading[] = [];
  syntaxTree(state).iterate({
    enter(node: SyntaxNodeRef) {
      const level = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name)?.[1];
      if (!level) return;
      const title = state.doc
        .sliceString(node.from, node.to)
        .replace(/^#{1,6}\s+/, '')
        .replace(/\n[=-]+\s*$/, '')
        .replace(/\s+#+\s*$/, '')
        .replace(/[*_`]/g, '')
        .trim();
      result.push({ from: node.from, level: Number(level), title });
    },
  });
  return result;
}
function preview(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const active = (from: number, to: number) =>
    state.selection.ranges.some(
      (r) => state.doc.lineAt(r.from).from <= to && state.doc.lineAt(r.to).to >= from,
    );
  syntaxTree(state).iterate({
    enter(node) {
      const heading = /^ATXHeading([1-6])$/.exec(node.name)?.[1];
      if (heading)
        ranges.push(
          Decoration.line({ class: `md-heading md-h${heading}` }).range(
            state.doc.lineAt(node.from).from,
          ),
        );
      if (node.name === 'Blockquote') {
        let line = state.doc.lineAt(node.from);
        while (line.from <= node.to) {
          ranges.push(Decoration.line({ class: 'md-quote' }).range(line.from));
          if (line.to >= node.to || line.number === state.doc.lines) break;
          line = state.doc.line(line.number + 1);
        }
      }
      if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
        let line = state.doc.lineAt(node.from);
        while (line.from <= node.to) {
          ranges.push(Decoration.line({ class: 'md-code-line' }).range(line.from));
          if (line.to >= node.to || line.number === state.doc.lines) break;
          line = state.doc.line(line.number + 1);
        }
        return false;
      }
      const tag =
        node.name === 'StrongEmphasis' ? 'strong' : node.name === 'Emphasis' ? 'em' : null;
      if (tag) ranges.push(Decoration.mark({ tagName: tag }).range(node.from, node.to));
      if (node.name === 'InlineCode')
        ranges.push(Decoration.mark({ class: 'md-inline-code' }).range(node.from, node.to));
      if (['HeaderMark', 'EmphasisMark', 'CodeMark', 'QuoteMark'].includes(node.name)) {
        const owner = node.node.parent;
        if (!active(owner?.from ?? node.from, owner?.to ?? node.to)) {
          let end = node.to;
          if (node.name === 'HeaderMark' || node.name === 'QuoteMark')
            while (end < state.doc.length && state.doc.sliceString(end, end + 1) === ' ') end++;
          ranges.push(Decoration.replace({}).range(node.from, end));
        }
      }
    },
  });
  return Decoration.set(ranges, true);
}
export const livePreview = StateField.define<DecorationSet>({
  create: preview,
  update: (_, transaction) => preview(transaction.state),
  provide: (field) => EditorView.decorations.from(field),
});
