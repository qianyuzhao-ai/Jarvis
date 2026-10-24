import { cloneElement, isValidElement, type ComponentProps, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../lib/utils';

export function SidebarItem({
  selected = false,
  disabled = false,
  depth = 0,
  icon,
  meta,
  trailing,
  children,
  className,
  style,
  asChild = false,
  onClickCapture,
  ...props
}: ComponentProps<'button'> & {
  selected?: boolean;
  depth?: number;
  icon?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  asChild?: boolean;
}) {
  const Component = asChild ? Slot : 'button';
  const content = (label: ReactNode) => (
    <>
      {icon && <span className="ui-sidebar-icon">{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {meta && <span className="text-callout text-fg-tertiary">{meta}</span>}
    </>
  );
  const child =
    asChild && isValidElement<{ children?: ReactNode }>(children)
      ? cloneElement(children, undefined, content(children.props.children))
      : content(children);
  return (
    <div className="ui-sidebar-row" data-selected={selected} data-disabled={disabled || undefined}>
      <Component
        {...props}
        type={asChild ? undefined : 'button'}
        disabled={asChild ? undefined : disabled}
        aria-disabled={disabled || props['aria-disabled']}
        tabIndex={asChild && disabled ? -1 : props.tabIndex}
        onClickCapture={(event) => {
          if (disabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClickCapture?.(event);
        }}
        data-ui="sidebar-item"
        data-selected={selected}
        className={cn('ui-sidebar-item', className)}
        style={{ paddingLeft: 8 + depth * 16, ...style }}
      >
        {child}
      </Component>
      {trailing && (
        <div
          className="ui-sidebar-trailing"
          inert={disabled || undefined}
          aria-hidden={disabled || undefined}
        >
          {trailing}
        </div>
      )}
    </div>
  );
}
