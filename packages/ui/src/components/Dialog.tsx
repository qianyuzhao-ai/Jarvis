import * as Primitive from '@radix-ui/react-dialog';
import { cva } from 'class-variance-authority';
import { X } from '@jarvis/ui/icons';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Button } from './Button';
export const Dialog = Primitive.Root;
export function DialogTrigger({ className, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger {...props} className={cn('cursor-default', className)} />;
}
export const DialogClose = Primitive.Close;
const sizes = cva(
  'ui-dialog ui-modal flex flex-col rounded-window bg-content text-fg shadow-dialog',
  {
    variants: {
      size: { sm: 'w-(--dialog-sm)', default: 'w-(--dialog-width)', lg: 'w-(--dialog-lg)' },
    },
    defaultVariants: { size: 'default' },
  },
);
export function DialogContent({
  size = 'default',
  className,
  ...props
}: ComponentProps<typeof Primitive.Content> & { size?: 'sm' | 'default' | 'lg' }) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay data-ui="dialog-overlay" className="ui-overlay bg-scrim" />
      <Primitive.Content {...props} data-ui="dialog" className={cn(sizes({ size }), className)} />
    </Primitive.Portal>
  );
}
export function DialogHeader({
  className,
  children,
  showClose = true,
  ...props
}: ComponentProps<'div'> & { showClose?: boolean }) {
  return (
    <div
      {...props}
      className={cn('flex shrink-0 items-start gap-3 pt-4 pr-3 pb-3 pl-5', className)}
    >
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
      {showClose && (
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" aria-label="关闭">
            <X />
          </Button>
        </DialogClose>
      )}
    </div>
  );
}
export function DialogTitle({ className, ...props }: ComponentProps<typeof Primitive.Title>) {
  return <Primitive.Title {...props} className={cn('text-title-3', className)} />;
}
export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof Primitive.Description>) {
  return (
    <Primitive.Description {...props} className={cn('text-callout text-fg-secondary', className)} />
  );
}
export function DialogBody({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('min-h-0 overflow-y-auto px-5 pb-5', className)} />;
}
export function DialogFooter({
  className,
  note,
  children,
  ...props
}: ComponentProps<'div'> & { note?: ReactNode }) {
  return (
    <div
      {...props}
      className={cn(
        'flex shrink-0 items-center justify-end gap-2 border-t border-separator px-5 py-3',
        className,
      )}
    >
      {note && <span className="mr-auto text-callout text-fg-secondary">{note}</span>}
      {children}
    </div>
  );
}
