import type { ComponentProps } from 'react';
import { cn } from '../lib/utils';
export type SpinnerProps = ComponentProps<'svg'> & {
  size?: 'sm' | 'default' | 'lg';
  tone?: 'default' | 'onAccent';
};
export function Spinner({
  size = 'default',
  tone = 'default',
  className,
  'aria-label': label = '正在加载',
  ...props
}: SpinnerProps) {
  return (
    <svg
      {...props}
      data-ui="spinner"
      data-size={size}
      data-tone={tone}
      className={cn(
        'ui-spinner shrink-0',
        tone === 'onAccent' ? 'text-fg-on-accent' : 'text-fg-secondary',
        className,
      )}
      viewBox="0 0 24 24"
      role="status"
      aria-label={label}
    >
      {Array.from({ length: 12 }, (_, index) => (
        <rect
          key={index}
          x="10.875"
          y="0.72"
          width="2.25"
          height="6.48"
          rx="1.125"
          fill="currentColor"
          opacity={1 - index * (0.82 / 11)}
          transform={`rotate(${-index * 30} 12 12)`}
        />
      ))}
    </svg>
  );
}
