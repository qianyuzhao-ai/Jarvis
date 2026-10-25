import { CandidateList, CandidateListItem } from '@jarvis/ui/components/CandidateList';
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
  onActive,
}: {
  id: string;
  options: PromptMention[];
  active: number;
  position: { left: number; top: number; width: number };
  onChoose: (token: string) => void;
  onActive: (index: number) => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menu.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return createPortal(
    <CandidateList
      ref={menu}
      id={id}
      className="prompt-mentions"
      aria-label="引用参考素材"
      style={position}
    >
      {options.map((item, index) => (
        <CandidateListItem
          key={item.token}
          id={`${id}-${index}`}
          active={active === index}
          onActive={() => onActive(index)}
          aria-label={`${item.label} ${item.name}`}
          title={`${item.label} · ${item.name}`}
          onClick={() => onChoose(item.token)}
          thumbnail
          media={
            <ReferenceMedia
              item={{ type: item.kind, name: item.name, url: item.url, blob: item.blob }}
            />
          }
          description={<span data-testid="prompt-mention-label">{item.label}</span>}
        >
          {item.name}
        </CandidateListItem>
      ))}
    </CandidateList>,
    document.body,
  );
}
