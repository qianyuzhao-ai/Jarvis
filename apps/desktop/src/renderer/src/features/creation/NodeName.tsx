import { useContext, useEffect, useRef, useState } from 'react';
import { NodeRenameContext } from './node-rename-context';

export function NodeName({ id, name }: { id: string; name: string }) {
  const rename = useContext(NodeRenameContext);
  const [draft, setDraft] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const editing = draft !== null;
  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);
  const className = 'asset-name node-name nodrag nopan';
  return editing ? (
    <input
      ref={input}
      className={className}
      aria-label="节点名称"
      value={draft}
      maxLength={100}
      autoComplete="off"
      spellCheck={false}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next && next !== name) rename?.(id, next);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
          requestAnimationFrame(() => button.current?.focus());
        } else if (event.key === 'Escape') {
          event.preventDefault();
          setDraft(null);
          requestAnimationFrame(() => button.current?.focus());
        }
      }}
    />
  ) : (
    <button
      ref={button}
      type="button"
      className={className}
      title={`${name} · 点击重命名`}
      aria-label={`重命名 ${name}`}
      onClick={(event) => {
        event.stopPropagation();
        setDraft(name);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {name}
    </button>
  );
}
