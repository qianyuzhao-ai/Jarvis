import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../lib/utils';
type ProgressProps = ComponentProps<'div'> & {
  value?: number | null;
  max?: number;
  size?: 'small' | 'regular';
  tone?: 'accent' | 'success' | 'danger';
};
function normalized(value: number | null | undefined, max: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(0, value))
    : undefined;
}
export function Progress({
  value,
  max = 100,
  size = 'regular',
  tone = 'accent',
  className,
  ...props
}: ProgressProps) {
  const limit = Number.isFinite(max) && max > 0 ? max : 100;
  const current = normalized(value, limit);
  return (
    <div
      {...props}
      data-ui="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={current}
      data-size={size}
      data-tone={tone}
      data-indeterminate={current === undefined}
      className={cn('ui-progress w-full overflow-hidden rounded-full bg-fill-pressed', className)}
    >
      <div
        className="ui-progress-indicator h-full rounded-full"
        style={{ width: current === undefined ? undefined : `${(current / limit) * 100}%` }}
      />
    </div>
  );
}
export function ProgressField({
  label,
  valueLabel,
  hint,
  className,
  tone = 'accent',
  ...props
}: ProgressProps & { label: ReactNode; valueLabel?: ReactNode; hint?: ReactNode }) {
  const id = useId();
  return (
    <div
      data-ui="progress-field"
      data-tone={tone}
      className={cn('ui-progress-field grid gap-1.5 text-fg', className)}
    >
      <div className="flex justify-between gap-2">
        <span id={`${id}-label`} className="text-body">
          {label}
        </span>
        <span className="ui-progress-value text-callout text-fg-secondary tabular-nums">
          {valueLabel ?? (props.value == null ? '—' : `${Math.round(props.value)}%`)}
        </span>
      </div>
      <Progress
        {...props}
        tone={tone}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <div id={`${id}-hint`} className="ui-progress-hint text-callout text-fg-secondary">
          {hint}
        </div>
      )}
    </div>
  );
}
export function ProgressRing({
  value,
  size = 16,
  tone = 'accent',
  className,
  ...props
}: ComponentProps<'svg'> & { value: number; size?: 16 | 24; tone?: 'accent' | 'danger' }) {
  const current = normalized(value, 100) ?? 0;
  return (
    <svg
      {...props}
      data-ui="progress-ring"
      data-size={size}
      data-tone={tone}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={current}
      viewBox="0 0 24 24"
      className={cn('ui-progress-ring shrink-0', className)}
    >
      <circle cx="12" cy="12" r="10" fill="none" className="ui-ring-track" />
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        pathLength="100"
        strokeDasharray={`${current} 100`}
        strokeLinecap="round"
        transform="rotate(-90 12 12)"
        className="ui-ring-value"
      />
    </svg>
  );
}
