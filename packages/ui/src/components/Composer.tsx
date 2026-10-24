import type { ComponentProps, ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/utils';
import { ArrowUp, Square } from '@jarvis/ui/icons';
import { IconButton } from './Button';
const composer = cva('ui-composer', {
  variants: { layout: { wide: 'ui-composer-wide', compact: 'w-full' } },
});
export function Composer({
  layout = 'wide',
  context,
  toolbar,
  actions,
  children,
  className,
  ...props
}: ComponentProps<'div'> & {
  layout?: 'wide' | 'compact';
  context?: ReactNode;
  toolbar?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div
      {...props}
      data-ui="composer"
      data-layout={layout}
      className={cn(composer({ layout }), className)}
    >
      {context && <div className="ui-composer-context">{context}</div>}
      <div data-ui="composer-input" className="ui-composer-input">
        {children}
        {(toolbar || actions) && (
          <div className="ui-composer-toolbar">
            <div className="min-w-0 flex flex-1 items-center gap-1">{toolbar}</div>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
export function ComposerAction({
  state,
  ...props
}: Omit<ComponentProps<typeof IconButton>, 'aria-label'> & { state: 'empty' | 'filled' | 'busy' }) {
  return (
    <IconButton
      {...props}
      aria-label={state === 'busy' ? '停止生成' : '发送消息'}
      disabled={state === 'empty' || props.disabled}
      variant={state === 'busy' ? 'secondary' : 'default'}
    >
      {state === 'busy' ? <Square /> : <ArrowUp />}
    </IconButton>
  );
}
