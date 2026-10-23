import * as Primitive from '@radix-ui/react-popover';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;
export const PopoverAnchor = Primitive.Anchor;
export const PopoverClose = Primitive.Close;
export function PopoverContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        {...props}
        sideOffset={sideOffset}
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
