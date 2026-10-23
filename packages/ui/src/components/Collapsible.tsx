import * as Primitive from '@radix-ui/react-collapsible';
import { ChevronRight } from 'lucide-react';
import { cva } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';
const variants = cva('ui-collapsible', {
  variants: { appearance: { plain: '', card: 'ui-hairline rounded-panel bg-surface' } },
  defaultVariants: { appearance: 'plain' },
});
export function Collapsible({
  className,
  appearance = 'plain',
  ...props
}: ComponentProps<typeof Primitive.Root> & { appearance?: 'plain' | 'card' }) {
  return (
    <Primitive.Root
      {...props}
      data-ui="collapsible"
      data-appearance={appearance}
      className={cn(variants({ appearance }), className)}
    />
  );
}
export function CollapsibleTrigger({
  className,
  children,
  meta,
  ...props
}: ComponentProps<typeof Primitive.Trigger> & { meta?: ReactNode }) {
  return (
    <Primitive.Trigger
      {...props}
      data-ui="collapsible-trigger"
      className={cn(
        'ui-collapse-trigger flex w-full cursor-default items-center gap-1 bg-transparent text-left',
        className,
      )}
    >
      <ChevronRight className="ui-collapse-chevron size-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{children}</span>
      {meta && <span className="text-callout text-fg-tertiary">{meta}</span>}
    </Primitive.Trigger>
  );
}
export function CollapsibleContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      {...props}
      data-ui="collapsible-content"
      className={cn('ui-collapse-content', className)}
    />
  );
}
