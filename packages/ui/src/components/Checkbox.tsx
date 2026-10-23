import * as Primitive from '@radix-ui/react-checkbox';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '../lib/utils';
import { useFieldControl } from './Field';
export type CheckboxProps = ComponentProps<typeof Primitive.Root> & {
  label?: ReactNode;
  description?: ReactNode;
};
export function Checkbox({ className, label, description, children, ...props }: CheckboxProps) {
  const generated = useId();
  const field = useFieldControl(props);
  const id = field.id ?? generated;
  return (
    <div
      data-ui="checkbox-row"
      data-disabled={field.disabled}
      className="inline-flex items-start gap-1.5 text-body text-fg"
    >
      <span
        data-ui="checkbox-slot"
        className="inline-flex size-4 shrink-0 items-center justify-center"
      >
        <Primitive.Root
          {...field}
          id={id}
          aria-describedby={
            [field['aria-describedby'], description ? `${id}-description` : undefined]
              .filter(Boolean)
              .join(' ') || undefined
          }
          data-ui="checkbox"
          className={cn(
            'ui-checkbox inline-flex shrink-0 items-center justify-center rounded-small bg-surface-raised shadow-control',
            className,
          )}
        >
          <Primitive.Indicator className="inline-flex">
            <Check data-ui="check-mark" aria-hidden="true" className="size-3" strokeWidth={1.75} />
            <Minus data-ui="mixed-mark" aria-hidden="true" className="size-3" strokeWidth={1.75} />
          </Primitive.Indicator>
          {children}
        </Primitive.Root>
      </span>
      {(label || description) && (
        <span className="min-w-0">
          <label htmlFor={id}>{label}</label>
          {description && (
            <span id={`${id}-description`} className="block text-subheadline text-fg-secondary">
              {description}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
