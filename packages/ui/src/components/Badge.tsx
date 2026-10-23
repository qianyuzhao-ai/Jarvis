import { cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
const variants = cva(
  'ui-badge inline-flex shrink-0 items-center gap-1 rounded-small px-1.5 text-subheadline font-semibold',
  {
    variants: {
      tone: {
        neutral: 'ui-tone-neutral',
        accent: 'ui-tone-accent',
        success: 'ui-tone-success',
        warning: 'ui-tone-warning',
        danger: 'ui-tone-danger',
        info: 'ui-tone-info',
      },
      appearance: { subtle: 'ui-badge-subtle', solid: 'ui-badge-solid' },
    },
    defaultVariants: { tone: 'neutral', appearance: 'subtle' },
  },
);
export function Badge({
  className,
  tone = 'neutral',
  appearance = 'subtle',
  ...props
}: ComponentProps<'span'> & { tone?: Tone; appearance?: 'subtle' | 'solid' }) {
  return (
    <span {...props} data-ui="badge" className={cn(variants({ tone, appearance }), className)} />
  );
}
export function BadgeCount({
  count,
  tone = 'accent',
  className,
  ...props
}: ComponentProps<'span'> & { count: number; tone?: 'accent' | 'danger' | 'neutral' }) {
  return (
    <span
      aria-label={`${count} 项`}
      {...props}
      data-ui="badge-count"
      data-tone={tone}
      className={cn(
        'ui-badge-count inline-flex shrink-0 items-center justify-center rounded-full px-1 text-footnote font-semibold',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
export function StatusDot({
  className,
  tone = 'neutral',
  ...props
}: ComponentProps<'span'> & { tone?: Exclude<Tone, 'info'> }) {
  return (
    <span
      {...props}
      aria-hidden="true"
      data-ui="status-dot"
      className={cn(
        'ui-status-dot inline-block size-2 shrink-0 rounded-full',
        `ui-tone-${tone}`,
        className,
      )}
    />
  );
}
