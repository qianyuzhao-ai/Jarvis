import { requestWritingAssistant } from './assistant-request';
import type { BufferView, BufferSelection } from './editor/buffer-view';

export function askWritingAssistant(
  documentId: string,
  prompt: string,
  open: () => void,
  view: BufferView | null,
  range?: BufferSelection,
) {
  if (!view || view.id !== documentId) return;
  if (range) view.setSelection(range);
  requestWritingAssistant(documentId, prompt);
  open();
}
