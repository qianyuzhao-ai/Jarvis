import { Check, CircleAlert, Info, X } from '@jarvis/ui/icons';
import { cva } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Button } from './Button';
const variants = cva('flex w-full items-start gap-2 rounded-control px-3 py-2 text-fg', {
  variants: {
    tone: {
      info: 'bg-info-subtle',
      success: 'bg-success-subtle',
      warning: 'bg-warning-subtle',
      error: 'bg-danger-subtle',
    },
  },
  defaultVariants: { tone: 'info' },
});
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  onDismiss,
  closeLabel = '关闭提示',
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'title'> & {
  tone?: 'info' | 'success' | 'warning' | 'error';
  title?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  closeLabel?: string;
}) {
  const Icon = tone === 'info' ? Info : tone === 'success' ? Check : CircleAlert;
  return (
    <div
      {...props}
      data-ui="alert"
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className={cn(variants({ tone }), className)}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'size-4 shrink-0',
          {
            info: 'text-info',
            success: 'text-success',
            warning: 'text-warning',
            error: 'text-danger',
          }[tone],
        )}
      />
      <div className="min-w-0 flex-1">
        {title && <div className="text-headline">{title}</div>}
        <div className="text-callout text-fg-secondary">{children}</div>
      </div>
      {action}
      {onDismiss && (
        <Button variant="ghost" size="icon-xs" aria-label={closeLabel} onClick={onDismiss}>
          <X />
        </Button>
      )}
    </div>
  );
}
