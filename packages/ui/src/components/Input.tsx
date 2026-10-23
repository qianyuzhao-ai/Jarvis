import type { ComponentProps } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/utils';
import { useFieldControl } from './Field';
export type ControlSize = 'sm' | 'default' | 'lg';
export const inputSizes = cva('', {
  variants: {
    size: {
      sm: 'h-(--control-h-small) rounded-small px-2 text-callout',
      default: 'h-(--control-h-regular) rounded-control px-2 text-body',
      lg: 'h-(--control-h-large) rounded-control px-3 text-body',
    },
  },
  defaultVariants: { size: 'default' },
});
export type InputProps = Omit<ComponentProps<'input'>, 'size'> & {
  size?: ControlSize;
  appearance?: 'default' | 'ghost';
};
export function Input({
  className,
  size = 'default',
  appearance = 'default',
  ...props
}: InputProps) {
  const control = useFieldControl(props);
  return (
    <input
      {...control}
      data-ui="input"
      data-size={size}
      data-appearance={appearance}
      className={cn(
        'ui-input min-w-0 w-full bg-surface text-fg placeholder:text-fg-tertiary',
        inputSizes({ size }),
        className,
      )}
    />
  );
}
