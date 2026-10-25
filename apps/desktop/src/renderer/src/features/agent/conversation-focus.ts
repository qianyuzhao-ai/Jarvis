import { writingScopeKey, type WritingScope } from '../../../../shared/writing-agent';

/**
 * Requests to show a particular conversation in a canvas or writing assistant, for example after
 * clicking its card on the home page. The assistant takes the request when it mounts, or at once if
 * it is already showing that project or document.
 */
const pending = new Map<string, string>();
const listeners = new Set<() => void>();

export const focusKey = (projectId?: string, scope?: WritingScope) =>
  projectId ? `canvas:${projectId}` : scope ? `writing:${writingScopeKey(scope)}` : null;

export function focusConversation(key: string, sessionId: string) {
  pending.set(key, sessionId);
  for (const listener of listeners) listener();
}
export function takeFocus(key: string) {
  const id = pending.get(key);
  pending.delete(key);
  return id;
}
export function onFocusRequest(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
