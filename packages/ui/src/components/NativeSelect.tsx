import type { ComponentProps, ReactNode } from 'react';
import { ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { inputSizes, type ControlSize } from './Input';
import { useFieldControl } from './Field';
export type NativeSelectProps = Omit<ComponentProps<'select'>, 'size'> & {
  size?: ControlSize;
  appearance?: 'default' | 'compact';
  placeholder?: string;
  leadingIcon?: ReactNode;
};
export function NativeSelect({
  size = 'default',
  appearance = 'default',
  placeholder,
  leadingIcon,
  className,
  children,
  ...props
}: NativeSelectProps) {
  const control = useFieldControl(props);
  const Icon = appearance === 'compact' ? ChevronDown : ChevronsUpDown;
  return (
    <div
      data-ui="select-wrapper"
      data-appearance={appearance}
      data-leading={!!leadingIcon}
      className={cn(
        'relative inline-flex min-w-0 items-center',
        appearance === 'default' && 'w-full',
      )}
    >
      {leadingIcon && (
        <span
          data-ui="select-leading"
          className="pointer-events-none absolute left-2 text-fg-secondary"
        >
          {leadingIcon}
        </span>
      )}
      <select
        {...control}
        data-ui="select"
        data-size={size}
        data-appearance={appearance}
        className={cn(
          'ui-select min-w-0 w-full appearance-none text-fg',
          inputSizes({ size: appearance === 'compact' ? 'sm' : size }),
          appearance === 'compact'
            ? 'bg-transparent text-callout'
            : 'bg-surface-raised shadow-control',
          className,
        )}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {children}
      </select>
      <Icon
        data-ui="select-chevron"
        aria-hidden="true"
        strokeWidth={1.75}
        className="pointer-events-none absolute right-1 size-3 text-fg-secondary"
      />
    </div>
  );
}
