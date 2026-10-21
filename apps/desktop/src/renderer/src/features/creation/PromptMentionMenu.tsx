import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ReferenceMedia } from './References';
import type { PromptMention } from './prompt-mentions';

export function PromptMentionMenu({
  id,
  options,
  active,
  position,
  onChoose,
}: {
  id: string;
  options: PromptMention[];
  active: number;
  position: { left: number; top: number; width: number };
  onChoose: (token: string) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menu.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return createPortal(
    <div
      ref={menu}
      id={id}
      className="prompt-mentions"
      role="listbox"
      aria-label="引用参考素材"
      style={position}
    >
      {options.map((item, index) => (
        <button
          type="button"
          role="option"
          tabIndex={-1}
          id={`${id}-${index}`}
          aria-selected={active === index}
          key={item.token}
          aria-label={`${item.label} ${item.name}`}
          title={`${item.label} · ${item.name}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChoose(item.token)}
        >
          <span className="prompt-mention-thumbnail" aria-hidden="true">
            <ReferenceMedia
              item={{ type: item.kind, name: item.name, url: item.url, blob: item.blob }}
            />
          </span>
          <div>
            <small>{item.name}</small>
            <span className="prompt-mention-label">{item.label}</span>
          </div>
        </button>
      ))}
    </div>,
    document.querySelector('.theme-root') ?? document.body,
  );
}
