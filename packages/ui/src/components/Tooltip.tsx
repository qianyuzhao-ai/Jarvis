import * as Primitive from '@radix-ui/react-tooltip';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';
export const TooltipRoot = Primitive.Root;
export const TooltipTrigger = Primitive.Trigger;
export function TooltipProvider({
  delayDuration = 500,
  ...props
}: ComponentProps<typeof Primitive.Provider>) {
  return <Primitive.Provider delayDuration={delayDuration} {...props} />;
}
export function TooltipContent({
  className,
  sideOffset = 6,
  shortcut,
  children,
  ...props
}: ComponentProps<typeof Primitive.Content> & { shortcut?: ReactNode }) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        {...props}
        sideOffset={sideOffset}
        data-ui="tooltip"
        className={cn(
          'ui-tooltip flex gap-2 rounded-small bg-surface-raised px-2 py-1 text-subheadline text-fg shadow-popover',
          className,
        )}
      >
        <span>{children}</span>
        {shortcut && <span className="shrink-0 text-fg-secondary">{shortcut}</span>}
      </Primitive.Content>
    </Primitive.Portal>
  );
}
export function Tooltip({
  children,
  content,
  shortcut,
  side = 'top',
  ...props
}: ComponentProps<typeof Primitive.Root> & {
  content: ReactNode;
  shortcut?: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipProvider>
      <TooltipRoot {...props}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent shortcut={shortcut} side={side}>
          {content}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}
