import * as Primitive from '@radix-ui/react-toggle';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
export function Toggle({
  variant = 'default',
  size = 'default',
  className,
  ...props
}: ComponentProps<typeof Primitive.Root> & {
  variant?: 'default' | 'outline';
  size?: 'sm' | 'default';
}) {
  return (
    <Primitive.Root
      {...props}
      data-ui="toggle"
      data-variant={variant}
      data-size={size}
      className={cn(
        'ui-toggle inline-flex items-center justify-center gap-1 rounded-control px-2 text-body text-fg-secondary',
        size === 'sm' ? 'h-(--control-h-small) text-callout' : 'h-(--control-h-regular)',
        variant === 'outline' && 'bg-surface-raised text-fg shadow-control',
        className,
      )}
    />
  );
}
