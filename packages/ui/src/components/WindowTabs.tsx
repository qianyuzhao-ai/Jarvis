import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { X } from '../icons';
import { IconButton } from './Button';

export function WindowTabs({ className, onKeyDown, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      role="tablist"
      data-ui="window-tabs"
      className={cn('ui-window-tabs', className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          !(event.target instanceof HTMLElement) ||
          event.target.getAttribute('role') !== 'tab'
        )
          return;
        const tabs = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'),
        );
        const index = tabs.indexOf(event.target as HTMLButtonElement);
        const next =
          event.key === 'ArrowRight'
            ? (index + 1) % tabs.length
            : event.key === 'ArrowLeft'
              ? (index - 1 + tabs.length) % tabs.length
              : event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? tabs.length - 1
                  : -1;
        if (next < 0) return;
        event.preventDefault();
        tabs[next]?.focus();
        tabs[next]?.click();
      }}
    />
  );
}
export function WindowTab({
  active = false,
  title,
  icon,
  dirty = false,
  onClose,
  className,
  ...props
}: Omit<ComponentProps<'button'>, 'title'> & {
  active?: boolean;
  title: string;
  icon?: ReactNode;
  dirty?: boolean;
  onClose?: () => void;
}) {
  return (
    <div data-ui="window-tab" data-active={active} className={cn('ui-window-tab', className)}>
      <button
        {...props}
        type="button"
        role="tab"
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        className="ui-window-tab-trigger"
        title={title}
      >
        {icon}
        <span className="min-w-0 truncate">{title}</span>
        {dirty && <span aria-label="未保存" className="ui-tab-dirty" />}
      </button>
      {onClose && (
        <IconButton
          variant="ghost"
          size="icon-xs"
          className="ui-window-tab-close"
          aria-label={`关闭 ${title}`}
          onClick={onClose}
        >
          <X />
        </IconButton>
      )}
    </div>
  );
}
