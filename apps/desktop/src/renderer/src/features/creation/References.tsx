import { useEffect, useRef, useState } from 'react';
import { Music, Plus, X } from 'lucide-react';
import { REFERENCE_LIMITS } from '../../../../shared/generation';
import { numberReferences } from './reference-order';
import type { MediaData, Reference } from './types';

function ReferenceMedia({ item }: { item: Reference }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const value = URL.createObjectURL(item.blob);
    queueMicrotask(() => setUrl(value));
    return () => URL.revokeObjectURL(value);
  }, [item.blob]);
  return item.type === 'image' ? (
    <img src={url || undefined} alt={item.name} />
  ) : item.type === 'video' ? (
    <video src={url || undefined} muted preload="metadata" aria-label={item.name} />
  ) : (
    <Music size={24} />
  );
}
export function References({
  disabled = false,
  expanded,
  onExpand,
  data,
  onChange,
  onError,
}: {
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
    <div className={`references ${expanded ? 'references-expanded' : 'references-compact'}`}>
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
      {!expanded && data.references.length > 0 && (
        <button
          type="button"
          className="reference-stack"
          aria-label={`查看 ${data.references.length} 个参考素材`}
          title="放大管理参考素材"
          onClick={onExpand}
        >
          {numbered.slice(-3).map(({ item, label }, index, items) => (
            <span
              className="reference-stack-card"
              key={item.id}
              style={{
                transform: `translate(${(items.length - index - 1) * 4}px, ${(items.length - index - 1) * 4}px)`,
                zIndex: index,
              }}
            >
              <ReferenceMedia item={item} />
              <span className="reference-index">{label}</span>
            </span>
          ))}
          <span className="reference-count">共 {data.references.length}</span>
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        className={`reference-add ${!expanded && data.references.length ? 'reference-add-overlay' : ''}`}
        title="添加参考素材，生成前上传"
        aria-label="添加参考素材"
        onClick={() => input.current?.click()}
      >
        <Plus size={!expanded && data.references.length ? 16 : 24} strokeWidth={1.75} />
      </button>
      {expanded &&
        numbered.map(({ item, number, label }) => (
          <div
            className="reference-item"
            title={`${label} · ${item.name}`}
            key={item.id}
            data-reference-type={item.type}
            data-reference-number={number}
          >
            <ReferenceMedia item={item} />
            <span className="reference-index">{label}</span>
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
    </div>
  );
}
