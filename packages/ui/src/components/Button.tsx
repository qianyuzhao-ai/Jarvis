import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cloneElement, isValidElement, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';
const variants = cva(
  'ui-button relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap font-sans',
  {
    variants: {
      variant: {
        default: 'bg-accent text-fg-on-accent',
        secondary: 'bg-surface-raised text-fg shadow-control',
        ghost: 'bg-transparent text-fg',
        destructive: 'bg-danger text-fg-on-accent',
      },
      size: {
        xs: 'h-(--control-h-mini) rounded-small px-2 text-subheadline',
        sm: 'h-(--control-h-small) rounded-small px-2 text-callout',
        default: 'h-(--control-h-regular) rounded-control px-3 text-body',
        lg: 'h-(--control-h-large) gap-2 rounded-control px-4 text-body',
        'icon-xs': 'size-(--control-h-mini) rounded-small p-0',
        'icon-sm': 'size-(--control-h-small) rounded-small p-0',
        icon: 'size-(--control-h-regular) rounded-control p-0',
        'icon-lg': 'size-(--control-h-large) rounded-control p-0',
      },
      shape: { rounded: '', capsule: 'rounded-full', circle: 'rounded-full' },
    },
    compoundVariants: [
      { shape: 'capsule', size: 'default', className: 'px-4' },
      { shape: 'capsule', size: 'lg', className: 'px-5' },
    ],
    defaultVariants: { variant: 'default', size: 'default', shape: 'rounded' },
  },
);
type Size = NonNullable<VariantProps<typeof variants>['size']>;
type IconSize = Extract<Size, `icon${string}`>;
type ShapeSize =
  | { shape?: 'rounded' | 'capsule'; size?: Size }
  | { shape: 'circle'; size: IconSize };
export type ButtonProps = ComponentProps<'button'> &
  ShapeSize & {
    variant?: 'default' | 'secondary' | 'ghost' | 'destructive';
    loading?: boolean;
    asChild?: boolean;
  };
export function Button({
  variant = 'default',
  size = 'default',
  shape = 'rounded',
  loading = false,
  asChild = false,
  disabled,
  className,
  children,
  type = 'button',
  onClickCapture,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';
  const slotChild =
    asChild && isValidElement<{ children?: ReactNode }>(children)
      ? cloneElement(
          children,
          undefined,
          <span className="ui-button-content inline-flex items-center justify-center">
            {children.props.children}
          </span>,
        )
      : children;
  return (
    <Component
      {...props}
      type={asChild ? undefined : type}
      disabled={asChild ? undefined : disabled || loading}
      aria-disabled={disabled || loading || props['aria-disabled']}
      aria-busy={loading || props['aria-busy']}
      data-ui="button"
      data-variant={variant}
      data-size={size}
      data-shape={shape}
      data-loading={loading}
      data-disabled={disabled || undefined}
      className={cn(variants({ variant, size, shape }), className)}
      onClickCapture={(event) => {
        if (disabled || loading) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onClickCapture?.(event);
      }}
      tabIndex={asChild && (disabled || loading) ? -1 : props.tabIndex}
    >
      {asChild ? (
        <Slottable>{slotChild}</Slottable>
      ) : (
        <span className="ui-button-content inline-flex items-center justify-center">
          {children}
        </span>
      )}
      {loading && (
        <span className="ui-button-spinner absolute inset-0 flex items-center justify-center">
          <Spinner
            size={
              size === 'xs' || size === 'sm' || size === 'icon-xs' || size === 'icon-sm'
                ? 'sm'
                : 'default'
            }
            tone={variant === 'default' || variant === 'destructive' ? 'onAccent' : 'default'}
            aria-hidden="true"
          />
        </span>
      )}
    </Component>
  );
}
export function IconButton({
  'aria-label': label,
  size = 'icon',
  ...props
}: Omit<ButtonProps, 'size'> & { size?: IconSize; 'aria-label': string }) {
  return (
    <Tooltip content={label}>
      <Button {...props} size={size} aria-label={label} />
    </Tooltip>
  );
}
