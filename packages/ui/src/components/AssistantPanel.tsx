import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/utils';
export function AssistantPanel({
  title,
  actions,
  header,
  composer,
  children,
  className,
  ...props
}: Omit<ComponentProps<'aside'>, 'title'> & {
  title: ReactNode;
  actions?: ReactNode;
  header?: ReactNode;
  composer?: ReactNode;
}) {
  return (
    <aside {...props} data-ui="assistant-panel" className={cn('ui-assistant-panel', className)}>
      {header ?? (
        <header className="ui-assistant-header">
          <strong className="min-w-0 flex-1 truncate text-headline">{title}</strong>
          {actions}
        </header>
      )}
      <div className="ui-assistant-body">{children}</div>
      {composer && <div className="ui-assistant-composer">{composer}</div>}
    </aside>
  );
}
export function AssistantEmpty({
  icon,
  title,
  children,
  suggestions,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'title'> & {
  icon?: ReactNode;
  title: ReactNode;
  suggestions?: ReactNode;
}) {
  return (
    <div {...props} className={cn('ui-assistant-empty', className)}>
      <div className="text-fg-tertiary">{icon}</div>
      <h3 className="text-headline">{title}</h3>
      <div className="text-callout text-fg-secondary">{children}</div>
      {suggestions && <div className="ui-assistant-suggestions">{suggestions}</div>}
    </div>
  );
}
