import { useRef, useState, type RefObject } from 'react';
import type { PromptMention } from './prompt-mentions';

const tokenPattern = /(@(?:image|video|audio)_\d+\b)/g;
export function PromptEditor({
  label,
  placeholder,
  value,
  disabled,
  mentions,
  onChange,
  inputRef,
}: {
  label: string;
  placeholder: string;
  value: string;
  disabled: boolean;
  mentions: PromptMention[];
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const mirror = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const options = mentions.filter((item) =>
    `${item.token} ${item.label} ${item.name}`.toLowerCase().includes(query?.toLowerCase() ?? ''),
  );
  function updateQuery(text: string, caret: number) {
    const match = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret));
    setQuery(
      match && !mentions.some((item) => item.token === `@${match[1]}`) ? (match[1] ?? null) : null,
    );
  }
  function insert(token: string) {
    const input = inputRef.current;
    if (!input) return;
    const before = value.slice(0, input.selectionStart);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
    if (!match) return;
    const start = before.length - match[1]!.length - 1;
    const next = value.slice(0, start) + token + ' ' + value.slice(input.selectionEnd);
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + token.length + 1, start + token.length + 1);
    });
  }
  return (
    <div className="prompt-field">
      <div ref={mirror} className="prompt-highlight" aria-hidden="true">
        {value.split(tokenPattern).map((part, index) =>
          /^@(?:image|video|audio)_\d+$/.test(part) ? (
            <span className="prompt-tag" key={`${index}-${part}`}>
              {part}
            </span>
          ) : (
            <span key={`${index}-${part}`}>{part}</span>
          ),
        )}
        {'\u200b'}
      </div>
      <textarea
        ref={inputRef}
        disabled={disabled}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          updateQuery(event.target.value, event.target.selectionStart);
        }}
        onClick={(event) =>
          updateQuery(event.currentTarget.value, event.currentTarget.selectionStart)
        }
        onKeyUp={(event) =>
          updateQuery(event.currentTarget.value, event.currentTarget.selectionStart)
        }
        onScroll={(event) => {
          if (mirror.current) mirror.current.scrollTop = event.currentTarget.scrollTop;
        }}
        onKeyDown={(event) => {
          if (query === null || !options.length) return;
          if (event.key === 'Escape') {
            event.stopPropagation();
            setQuery(null);
          } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            insert(options[0]!.token);
          }
        }}
      />
      {query !== null && options.length > 0 && (
        <div className="prompt-mentions" role="listbox" aria-label="引用参考素材">
          {options.map((item) => (
            <button
              type="button"
              role="option"
              aria-selected={false}
              key={item.token}
              title={`${item.label} · ${item.name}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insert(item.token)}
            >
              <span>{item.label}</span>
              <small>{item.name}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
