import * as Primitive from '@radix-ui/react-popover';
import { useRef, type ComponentProps } from 'react';
import { cn } from '../lib/utils';
export const Popover = Primitive.Root;
export function PopoverTrigger({ className, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger {...props} className={cn('cursor-default', className)} />;
}
export const PopoverAnchor = Primitive.Anchor;
export const PopoverClose = Primitive.Close;
export function PopoverContent({
  className,
  sideOffset = 6,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  const restoreFocus = useRef<HTMLElement | null>(null);
  return (
    <Primitive.Portal>
      <Primitive.Content
        {...props}
        sideOffset={sideOffset}
        onOpenAutoFocus={(event) => {
          restoreFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (!event.defaultPrevented && restoreFocus.current?.isConnected) {
            event.preventDefault();
            restoreFocus.current.focus();
          }
        }}
        data-ui="popover"
        className={cn(
          'ui-floating ui-popover flex flex-col gap-2 rounded-panel bg-surface-raised p-3 text-fg shadow-popover',
          className,
        )}
      />
    </Primitive.Portal>
  );
}
export function PopoverTitle({ className, ...props }: ComponentProps<'h3'>) {
  return <h3 {...props} className={cn('text-headline', className)} />;
}
export function PopoverDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p {...props} className={cn('text-callout text-fg-secondary', className)} />;
}
export function PopoverFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div {...props} className={cn('flex justify-end gap-2', className)} />;
}
