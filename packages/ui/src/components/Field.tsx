import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useId,
  type ComponentProps,
  type ReactNode,
  type ElementType,
} from 'react';
import { CircleAlert } from '@jarvis/ui/icons';
import { cn } from '../lib/utils';
const FieldContext = createContext<{
  controlId: string;
  descriptionId: string;
  errorId: string;
  describedBy?: string;
  invalid: boolean;
  disabled: boolean;
} | null>(null);
function contains(children: ReactNode, type: ElementType): boolean {
  return Children.toArray(children).some(
    (child) =>
      isValidElement<{ children?: ReactNode }>(child) &&
      ((child.type === type && Boolean(child.props.children)) ||
        contains(child.props.children, type)),
  );
}
export function Field({
  controlId,
  orientation = 'vertical',
  disabled = false,
  invalid = false,
  description,
  error,
  className,
  children,
  ...props
}: ComponentProps<'div'> & {
  controlId?: string;
  orientation?: 'vertical' | 'horizontal';
  disabled?: boolean;
  invalid?: boolean;
  description?: ReactNode;
  error?: ReactNode;
}) {
  const generated = useId();
  const id = controlId ?? generated;
  const hasError = Boolean(error) || contains(children, FieldError);
  const isInvalid = invalid || hasError;
  const hasDescription = Boolean(description) || contains(children, FieldDescription);
  return (
    <FieldContext.Provider
      value={{
        controlId: id,
        descriptionId: `${id}-description`,
        errorId: `${id}-error`,
        invalid: isInvalid,
        disabled,
        describedBy: hasError
          ? `${id}-error`
          : !isInvalid && hasDescription
            ? `${id}-description`
            : undefined,
      }}
    >
      <div
        {...props}
        data-ui="field"
        data-orientation={orientation}
        data-disabled={disabled}
        className={cn('ui-field grid gap-2 text-body text-fg', className)}
      >
        {children}
        {error ? (
          <FieldError>{error}</FieldError>
        ) : description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
export function FieldLabel({ className, htmlFor, ...props }: ComponentProps<'label'>) {
  const field = useContext(FieldContext);
  return (
    <label
      {...props}
      htmlFor={htmlFor ?? field?.controlId}
      data-ui="field-label"
      className={cn('text-body', className)}
    />
  );
}
export function FieldDescription({ className, id, ...props }: ComponentProps<'p'>) {
  const field = useContext(FieldContext);
  if (field?.invalid) return null;
  return (
    <p
      {...props}
      id={id ?? field?.descriptionId}
      data-ui="field-description"
      className={cn('text-subheadline text-fg-secondary', className)}
    />
  );
}
export function FieldError({ className, id, children, ...props }: ComponentProps<'p'>) {
  const field = useContext(FieldContext);
  if (!children) return null;
  return (
    <p
      {...props}
      id={id ?? field?.errorId}
      data-ui="field-error"
      role="alert"
      className={cn('flex items-start gap-1 text-subheadline text-danger', className)}
    >
      <CircleAlert className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {children}
    </p>
  );
}
export function useFieldControl<
  T extends {
    id?: string;
    disabled?: boolean;
    'aria-invalid'?: ComponentProps<'input'>['aria-invalid'];
    'aria-describedby'?: string;
  },
>(props: T) {
  const field = useContext(FieldContext);
  return {
    ...props,
    id: props.id ?? field?.controlId,
    disabled: props.disabled ?? field?.disabled,
    'aria-invalid': props['aria-invalid'] ?? (field?.invalid || undefined),
    'aria-describedby':
      [props['aria-describedby'], field?.describedBy].filter(Boolean).join(' ') || undefined,
  };
}
