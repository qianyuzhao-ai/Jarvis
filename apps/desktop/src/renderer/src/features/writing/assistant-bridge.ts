import { requestWritingAssistant } from './assistant-request';
/** Shared UI entry point; document-scoped sending and block context are completed in W4. */
export function askWritingAssistant(documentId: string, prompt: string, open: () => void) {
  requestWritingAssistant(documentId, prompt);
  open();
}
