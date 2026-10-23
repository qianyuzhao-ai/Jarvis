import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';
export function CandidateList({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      {...props}
      role="listbox"
      data-ui="candidate-list"
      className={cn(
        'ui-floating rounded-panel bg-surface-raised p-1 text-fg shadow-popover',
        className,
      )}
    />
  );
}
export function CandidateListLabel({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div {...props} className={cn('px-2 py-1 text-subheadline text-fg-secondary', className)} />
  );
}
export function CandidateListEmpty({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div {...props} className={cn('p-3 text-center text-callout text-fg-tertiary', className)} />
  );
}
export function CandidateListItem({
  id,
  active,
  media,
  thumbnail = false,
  description,
  meta,
  children,
  className,
  onActive,
  onMouseEnter,
  onMouseDown,
  ...props
}: Omit<ComponentProps<'button'>, 'id'> & {
  id: string;
  active: boolean;
  media?: ReactNode;
  thumbnail?: boolean;
  description?: ReactNode;
  meta?: ReactNode;
  onActive?: () => void;
}) {
  return (
    <button
      {...props}
      type="button"
      id={id}
      role="option"
      tabIndex={-1}
      aria-selected={active}
      data-ui="candidate-item"
      className={cn(
        'ui-candidate-item flex w-full items-center gap-2 rounded-small p-2 text-left text-body',
        className,
      )}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (!event.defaultPrevented) onActive?.();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        onMouseDown?.(event);
      }}
    >
      {media && (
        <span
          aria-hidden="true"
          data-thumbnail={thumbnail}
          className="ui-candidate-media shrink-0 text-fg-secondary"
        >
          {media}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span data-ui="candidate-title" className="block truncate">
          {children}
        </span>
        {description && (
          <span
            data-ui="candidate-description"
            className="block truncate text-callout text-fg-secondary"
          >
            {description}
          </span>
        )}
      </span>
      {meta && <span className="shrink-0 text-callout text-fg-tertiary">{meta}</span>}
    </button>
  );
}
