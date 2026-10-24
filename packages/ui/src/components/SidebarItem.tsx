import type { ComponentProps, ReactNode } from 'react';
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
  return (
    <div className="ui-sidebar-row" data-selected={selected} data-disabled={disabled || undefined}>
      <Component
        {...props}
        type={asChild ? undefined : 'button'}
        disabled={disabled}
        data-ui="sidebar-item"
        data-selected={selected}
        className={cn('ui-sidebar-item', className)}
        style={{ paddingLeft: 8 + depth * 16, ...style }}
      >
        {icon && <span className="ui-sidebar-icon">{icon}</span>}
        <span className="min-w-0 flex-1 truncate text-left">{children}</span>
        {meta && <span className="text-callout text-fg-tertiary">{meta}</span>}
      </Component>
      {trailing && <div className="ui-sidebar-trailing">{trailing}</div>}
    </div>
  );
}
