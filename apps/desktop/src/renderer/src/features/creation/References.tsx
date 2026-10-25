import { BadgeCount } from '@jarvis/ui/components/Badge';
import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Music, Plus, Video, X } from '@jarvis/ui/icons';
import { REFERENCE_LIMITS } from '../../../../shared/generation';
import { numberReferences } from './reference-order';
import type { MediaData, Reference } from './types';
import type { PromptMention } from './prompt-mentions';

export function ReferenceMedia({
  item,
}: {
  item: { type: Reference['type']; name: string; blob?: Blob; url?: string };
}) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setFailed(false);
        setUrl('');
      }
    });
    if (item.blob) {
      const value = URL.createObjectURL(item.blob);
      queueMicrotask(() => {
        if (active) setUrl(value);
      });
      return () => {
        active = false;
        URL.revokeObjectURL(value);
      };
    }
    if (item.url) {
      void window.desktop!.generation.mediaUrl(item.url).then(
        (response) => {
          if (active) setUrl(response.ok ? response.value : '');
        },
        () => {
          if (active) setUrl('');
        },
      );
    }
    return () => {
      active = false;
    };
  }, [item.blob, item.url]);
  const src = url;
  if ((!src || failed) && item.type !== 'audio')
    return item.type === 'image' ? <ImageIcon size={24} /> : <Video size={24} />;
  return item.type === 'image' ? (
    <img src={src || undefined} alt={item.name} onError={() => setFailed(true)} />
  ) : item.type === 'video' ? (
    <video
      src={src || undefined}
      muted
      playsInline
      preload="metadata"
      aria-label={item.name}
      onError={() => setFailed(true)}
    />
  ) : (
    <Music size={24} />
  );
}
export function References({
  items,
  disabled = false,
  expanded,
  onExpand,
  data,
  onChange,
  onError,
}: {
  items: PromptMention[];
  disabled?: boolean;
  expanded: boolean;
  onExpand: () => void;
  data: MediaData;
  onChange: (references: Reference[]) => void;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const numbered = numberReferences(data.references);
  function add(files: FileList | null) {
    if (!files) return;
    const next = [...data.references];
    const issues = new Set<string>();
    for (const file of Array.from(files)) {
      const type = file.type.split('/')[0];
      if (
        !['image', 'video', 'audio'].includes(type ?? '') ||
        (data.kind === 'image' && type !== 'image')
      ) {
        issues.add(
          data.kind === 'image'
            ? '图像节点只支持参考图片，最多 9 张'
            : `${file.name}：不支持此类型`,
        );
        continue;
      }
      const kind = type as Reference['type'];
      const limit = kind === 'image' ? 32 : kind === 'video' ? 200 : 64;
      if (file.size > limit * 1024 * 1024) {
        issues.add(`${file.name}：超过 ${limit} MiB`);
        continue;
      }
      if (next.filter((r) => r.type === kind).length >= REFERENCE_LIMITS[kind]) {
        issues.add(
          { image: '参考图片最多 9 张', video: '参考视频最多 3 个', audio: '参考音频最多 3 个' }[
            kind
          ],
        );
        continue;
      }
      next.push({ id: crypto.randomUUID(), name: file.name, type: kind, blob: file });
    }
    onChange(next);
    onError([...issues].join('；'));
    if (input.current) input.current.value = '';
  }
  return (
    <div
      data-testid="references"
      className={`references ${expanded ? 'references-expanded' : 'references-compact'}`}
    >
      <input
        disabled={disabled}
        ref={input}
        type="file"
        hidden
        multiple
        accept={data.kind === 'image' ? 'image/*' : 'image/*,video/*,audio/*'}
        aria-label="选择参考素材"
        onChange={(e) => add(e.target.files)}
      />
      {!expanded && items.length > 0 && (
        <button
          type="button"
          data-testid="reference-stack"
          className="reference-stack"
          aria-label={`查看 ${items.length} 个参考素材`}
          title="放大查看参考素材"
          onClick={onExpand}
        >
          {items.slice(-3).map((item, index, items) => (
            <span
              className="reference-stack-card"
              key={item.token}
              style={{
                transform: `translate(${(items.length - index - 1) * 4}px, ${(items.length - index - 1) * 4}px)`,
                zIndex: index,
              }}
            >
              <ReferenceMedia key={item.url ?? item.token} item={{ ...item, type: item.kind }} />
              <span data-testid="reference-index" className="reference-index">
                {item.label}
              </span>
            </span>
          ))}
          <BadgeCount
            className="reference-count"
            tone="neutral"
            count={items.length}
            aria-label={`共 ${items.length} 个参考素材`}
          />
        </button>
      )}
      {!expanded && items.length === 0 && (
        <div
          className="reference-empty"
          title="连接上游节点以添加参考素材"
          aria-label="暂无参考素材"
        >
          <ImageIcon size={24} strokeWidth={1.75} />
          <span>
            连接上游节点
            <br />
            或放大后添加
          </span>
        </div>
      )}
      {expanded && (
        <button
          type="button"
          disabled={disabled}
          className="reference-add"
          title="添加参考素材，生成前上传"
          aria-label="添加参考素材"
          onClick={() => input.current?.click()}
        >
          <Plus size={24} strokeWidth={1.75} />
        </button>
      )}
      {expanded &&
        numbered.map(({ item, number, label }) => (
          <div
            data-testid="reference-item"
            className="reference-item"
            title={`${label} · ${item.name}`}
            key={item.id}
            data-reference-type={item.type}
            data-reference-number={number}
          >
            <ReferenceMedia item={item} />
            <span data-testid="reference-index" className="reference-index">
              {label}
            </span>
            <button
              type="button"
              disabled={disabled}
              aria-label={`移除 ${item.name}`}
              onClick={() => {
                onChange(data.references.filter((r) => r.id !== item.id));
                onError('');
              }}
            >
              <X size={12} />
            </button>
            <small>{item.name}</small>
          </div>
        ))}
      {expanded &&
        items.slice(data.references.length).map((item) => (
          <div
            data-testid="reference-item"
            className="reference-item"
            key={item.token}
            title={`${item.label} · ${item.name}`}
          >
            <ReferenceMedia key={item.url ?? item.token} item={{ ...item, type: item.kind }} />
            <span data-testid="reference-index" className="reference-index">
              {item.label}
            </span>
            <small>{item.name}</small>
          </div>
        ))}
    </div>
  );
}
