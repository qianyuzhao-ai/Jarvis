import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { inputSizes, type ControlSize } from './Input';
export function InputGroup({
  size = 'default',
  className,
  ...props
}: ComponentProps<'div'> & { size?: ControlSize }) {
  return (
    <div
      {...props}
      data-ui="input-group"
      data-size={size}
      className={cn(
        'ui-input-group flex w-full min-w-0 items-center gap-1 bg-surface text-fg',
        inputSizes({ size }),
        'pr-1',
        className,
      )}
    />
  );
}
export function InputGroupAddon({
  align = 'start',
  className,
  ...props
}: ComponentProps<'span'> & { align?: 'start' | 'end' }) {
  return (
    <span
      {...props}
      data-ui="input-addon"
      data-align={align}
      className={cn(
        'inline-flex shrink-0 items-center',
        align === 'start' ? 'text-fg-tertiary' : 'pr-1 text-fg-secondary',
        className,
      )}
    />
  );
}
