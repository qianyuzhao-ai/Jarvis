import * as Primitive from '@radix-ui/react-toast';
import { Check, CircleAlert, Info, X } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { Spinner } from './Spinner';
export type ToastOptions = {
  title: string;
  description?: ReactNode;
  tone?: 'info' | 'success' | 'warning' | 'error' | 'loading';
  duration?: number;
  action?: { label: string; onClick: () => void };
  closeLabel?: string;
  onDismiss?: () => void;
  testId?: string;
};
type Entry = ToastOptions & { id: string };
let entries: Entry[] = [];
let serial = 0;
const listeners = new Set<() => void>();
function emit() {
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function snapshot() {
  return entries;
}
function dismiss(id: string) {
  const entry = entries.find((item) => item.id === id);
  if (!entry) return;
  entries = entries.filter((item) => item.id !== id);
  emit();
  entry.onDismiss?.();
}
function update(id: string, options: Partial<ToastOptions>) {
  entries = entries.map((item) => (item.id === id ? { ...item, ...options } : item));
  emit();
}
export const toast = Object.assign(
  (options: ToastOptions) => {
    const id = `toast-${++serial}`;
    entries = [...entries, { ...options, id }];
    emit();
    return id;
  },
  { update, dismiss },
);
export function Toaster() {
  const items = useSyncExternalStore(subscribe, snapshot, snapshot);
  return createPortal(
    <Primitive.Provider swipeDirection="right">
      <>
        {items.slice(0, 3).map((entry) => {
          const tone = entry.tone ?? 'info';
          const Icon = tone === 'success' ? Check : tone === 'info' ? Info : CircleAlert;
          return (
            <Primitive.Root
              key={entry.id}
              open
              duration={
                entry.duration ??
                (tone === 'error' || tone === 'loading' ? Number.POSITIVE_INFINITY : 5000)
              }
              onOpenChange={(open) => {
                if (!open) dismiss(entry.id);
              }}
              data-ui="toast"
              data-testid={entry.testId}
              data-tone={tone}
              data-toast-id={entry.id}
              role={tone === 'error' ? 'alert' : 'status'}
              className="ui-toast ui-hairline flex items-start gap-2 rounded-panel bg-surface-raised p-3 pr-2 text-fg shadow-popover"
            >
              {tone === 'loading' ? (
                <Spinner />
              ) : (
                <Icon aria-hidden="true" className="ui-toast-icon size-4 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <Primitive.Title className="text-headline">{entry.title}</Primitive.Title>
                {entry.description && (
                  <Primitive.Description className="text-callout text-fg-secondary">
                    {entry.description}
                  </Primitive.Description>
                )}
              </div>
              {entry.action && (
                <Primitive.Action asChild altText={entry.action.label}>
                  <Button variant="secondary" size="sm" onClick={entry.action.onClick}>
                    {entry.action.label}
                  </Button>
                </Primitive.Action>
              )}
              <Primitive.Close asChild>
                <Button variant="ghost" size="icon-xs" aria-label={entry.closeLabel ?? '关闭通知'}>
                  <X />
                </Button>
              </Primitive.Close>
            </Primitive.Root>
          );
        })}
        <Primitive.Viewport
          data-ui="toast-viewport"
          className="ui-toast-viewport flex flex-col-reverse gap-2"
          label="通知（F8）"
        />
      </>
    </Primitive.Provider>,
    document.body,
  );
}
