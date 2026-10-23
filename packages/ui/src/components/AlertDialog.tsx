import * as Primitive from '@radix-ui/react-alert-dialog';
import { CircleAlert } from 'lucide-react';
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { cn } from '../lib/utils';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
export const AlertDialog = Primitive.Root;
export function AlertDialogTrigger({
  className,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger {...props} className={cn('cursor-default', className)} />;
}
export const AlertDialogCancel = Primitive.Cancel;
export const AlertDialogAction = Primitive.Action;
export function AlertDialogContent({
  className,
  tone = 'default',
  ...props
}: ComponentProps<typeof Primitive.Content> & { tone?: 'default' | 'destructive' }) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay data-ui="dialog-overlay" className="ui-overlay bg-scrim" />
      <Primitive.Content
        {...props}
        data-ui="alert-dialog"
        data-tone={tone}
        className={cn(
          'ui-modal ui-alert-dialog flex flex-col items-center gap-3 rounded-window bg-surface-raised px-4 pt-5 pb-4 text-center text-fg shadow-dialog',
          className,
        )}
      />
    </Primitive.Portal>
  );
}
export function AlertDialogIcon({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      className={cn(
        'ui-alert-icon flex shrink-0 items-center justify-center rounded-full',
        className,
      )}
    >
      <CircleAlert aria-hidden="true" />
    </div>
  );
}
export function AlertDialogTitle({ className, ...props }: ComponentProps<typeof Primitive.Title>) {
  return <Primitive.Title {...props} className={cn('w-full text-headline', className)} />;
}
export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof Primitive.Description>) {
  return (
    <Primitive.Description
      {...props}
      className={cn('w-full text-callout text-fg-secondary', className)}
    />
  );
}
export function AlertDialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('ui-confirm-actions flex w-full gap-2', className)} />;
}
export type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'destructive';
  checkboxLabel?: string;
  onCheckedChange?: (checked: boolean) => void;
};
type Request = {
  id: number;
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
  focus: HTMLElement | null;
};
const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);
export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm requires ConfirmProvider');
  return confirm;
}
function ConfirmPrompt({
  request,
  finish,
  hasNext,
}: {
  request: Request;
  finish: (value: boolean) => void;
  hasNext: () => boolean;
}) {
  const [checked, setChecked] = useState(false);
  const { options } = request;
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) finish(false);
      }}
    >
      <AlertDialogContent
        tone={options.tone}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!hasNext() && request.focus?.isConnected) request.focus.focus();
        }}
      >
        <AlertDialogIcon />
        <AlertDialogTitle>{options.title}</AlertDialogTitle>
        <AlertDialogDescription>{options.message}</AlertDialogDescription>
        {options.checkboxLabel && (
          <div className="w-full text-left">
            <Checkbox
              label={options.checkboxLabel}
              checked={checked}
              onCheckedChange={(value) => {
                setChecked(value === true);
                options.onCheckedChange?.(value === true);
              }}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="secondary" onClick={() => finish(false)}>
              {options.cancelLabel ?? '取消'}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              variant={options.tone === 'destructive' ? 'destructive' : 'default'}
              onClick={() => finish(true)}
            >
              {options.confirmLabel ?? '确认'}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const queue = useRef<Request[]>([]);
  const nextId = useRef(0);
  const mounted = useRef(true);
  const [current, setCurrent] = useState<Request>();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const request of queue.current.splice(0)) request.resolve(false);
    };
  }, []);
  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        if (!mounted.current) {
          resolve(false);
          return;
        }
        const request = {
          id: ++nextId.current,
          options,
          resolve,
          focus:
            queue.current[0]?.focus ??
            (document.activeElement instanceof HTMLElement ? document.activeElement : null),
        };
        queue.current.push(request);
        if (queue.current.length === 1) setCurrent(request);
      }),
    [],
  );
  function finish(id: number, value: boolean) {
    const request = queue.current[0];
    if (request?.id !== id) return;
    queue.current.shift();
    setCurrent(queue.current[0]);
    request.resolve(value);
  }
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {current && (
        <ConfirmPrompt
          key={current.id}
          request={current}
          finish={(value) => finish(current.id, value)}
          hasNext={() => queue.current.length > 0}
        />
      )}
    </ConfirmContext.Provider>
  );
}
