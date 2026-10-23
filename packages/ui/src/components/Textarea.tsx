import { useTextareaResize } from '../hooks/use-textarea-resize';
import { useImperativeHandle, useRef, useState, type ComponentProps } from 'react';
import { cn } from '../lib/utils';
import { useFieldControl } from './Field';
export type TextareaProps = ComponentProps<'textarea'> & {
  autoResize?: boolean;
  showCount?: boolean;
};
export function Textarea({
  autoResize = false,
  showCount = false,
  ref,
  className,
  value,
  defaultValue,
  onInput,
  ...props
}: TextareaProps) {
  const node = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => node.current!, []);
  const [count, setCount] = useState(String(defaultValue ?? '').length);
  const control = useFieldControl(props);
  const resize = useTextareaResize(node, autoResize, value);
  return (
    <div data-ui="textarea-wrapper" className="relative min-w-0 w-full self-start">
      <textarea
        {...control}
        ref={node}
        rows={props.rows ?? (autoResize ? 1 : undefined)}
        data-ui="textarea"
        data-auto={autoResize}
        data-count={showCount}
        value={value}
        defaultValue={defaultValue}
        className={cn(
          'ui-textarea block w-full min-w-0 rounded-control bg-surface px-2 py-1 text-body-relaxed text-fg placeholder:text-fg-tertiary',
          className,
        )}
        onInput={(event) => {
          resize();
          setCount(event.currentTarget.value.length);
          onInput?.(event);
        }}
      />
      {showCount && (
        <span
          data-ui="textarea-count"
          className="pointer-events-none absolute right-2 bottom-1 text-footnote text-fg-secondary tabular-nums"
        >
          {value === undefined ? count : String(value).length}
          {props.maxLength ? ` / ${props.maxLength}` : ''}
        </span>
      )}
    </div>
  );
}
