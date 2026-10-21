import { EditorState, StateField, Transaction } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

export function referenceRanges(text: string) {
  return [...text.matchAll(/@(?:image|video|audio)_\d+\b/g)].map((match) => ({
    from: match.index,
    to: match.index + match[0].length,
    token: match[0],
  }));
}
export function referenceSelection(text: string, anchor: number, head: number) {
  const ranges = referenceRanges(text);
  if (anchor === head) {
    const token = ranges.find((r) => r.from < head && head < r.to);
    const position = token ? (head - token.from < token.to - head ? token.from : token.to) : head;
    return { anchor: position, head: position };
  }
  let from = Math.min(anchor, head),
    to = Math.max(anchor, head);
  for (const token of ranges)
    if (token.from < to && token.to > from) {
      from = Math.min(from, token.from);
      to = Math.max(to, token.to);
    }
  return anchor < head ? { anchor: from, head: to } : { anchor: to, head: from };
}
class ReferenceTag extends WidgetType {
  constructor(readonly token: string) {
    super();
  }
  eq(other: ReferenceTag) {
    return other.token === this.token;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'prompt-tag';
    span.textContent = this.token;
    span.contentEditable = 'false';
    return span;
  }
  ignoreEvent() {
    return false;
  }
}
function decorate(state: EditorState) {
  return Decoration.set(
    referenceRanges(state.doc.toString()).map(({ from, to, token }) =>
      Decoration.replace({ widget: new ReferenceTag(token) }).range(from, to),
    ),
  );
}
const tags = StateField.define<DecorationSet>({
  create: decorate,
  update: (value, transaction) => (transaction.docChanged ? decorate(transaction.state) : value),
  provide: (field) => [
    EditorView.decorations.from(field),
    EditorView.atomicRanges.of((v) => v.state.field(field)),
  ],
});
const atomicEditing = EditorState.transactionFilter.of((tr) => {
  if (tr.isUserEvent('undo') || tr.isUserEvent('redo')) return tr;
  const text = tr.startState.doc.toString();
  if (!tr.docChanged && tr.selection) {
    const { anchor, head } = tr.selection.main;
    const selection = referenceSelection(text, anchor, head);
    return selection.anchor === anchor && selection.head === head
      ? tr
      : { selection, scrollIntoView: tr.scrollIntoView };
  }
  const changes: { from: number; to: number; insert: string }[] = [];
  tr.changes.iterChanges((from, to, _a, _b, inserted) =>
    changes.push({ from, to, insert: inserted.toString() }),
  );
  const change = changes.length === 1 ? changes[0] : undefined;
  if (!change) return tr;
  let { from, to } = change;
  for (const token of referenceRanges(text))
    if (
      (from < token.to && to > token.from) ||
      (from === to && from > token.from && from < token.to)
    ) {
      from = Math.min(from, token.from);
      to = Math.max(to, token.to);
    }
  if (from === change.from && to === change.to) return tr;
  return {
    changes: { from, to, insert: change.insert },
    selection: { anchor: from + change.insert.length },
    scrollIntoView: tr.scrollIntoView,
    annotations: [
      Transaction.userEvent.of(tr.annotation(Transaction.userEvent) ?? 'input'),
      Transaction.addToHistory.of(tr.annotation(Transaction.addToHistory) ?? true),
    ],
  };
});
const atomicHistory = EditorState.transactionExtender.of((tr) => {
  if (
    !tr.docChanged ||
    tr.isUserEvent('undo') ||
    tr.isUserEvent('redo') ||
    tr.annotation(Transaction.addToHistory) === false
  )
    return null;
  const tokens = referenceRanges(tr.startState.doc.toString());
  let touchesTag = false;
  tr.changes.iterChanges((from, to, _a, _b, inserted) => {
    if (
      tokens.some((t) => from < t.to && to > t.from) ||
      referenceRanges(inserted.toString()).length
    )
      touchesTag = true;
  });
  return touchesTag ? { annotations: isolateHistory.of('full') } : null;
});
export const promptReferenceEditing = [tags, atomicEditing, atomicHistory];
