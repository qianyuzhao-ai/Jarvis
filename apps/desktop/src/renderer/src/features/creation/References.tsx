import { useEffect, useRef, useState } from 'react';
import { Music, Plus, X } from 'lucide-react';
import type { MediaData, Reference } from './types';
function ReferencePreview({ item, onRemove }: { item: Reference; onRemove: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const value = URL.createObjectURL(item.blob);
    queueMicrotask(() => setUrl(value));
    return () => URL.revokeObjectURL(value);
  }, [item.blob]);
  return (
    <div className="reference-item" title={item.name}>
      {item.type === 'image' ? (
        <img src={url || undefined} alt={item.name} />
      ) : item.type === 'video' ? (
        <video src={url || undefined} muted preload="metadata" aria-label={item.name} />
      ) : (
        <Music size={24} />
      )}
      <button type="button" aria-label={`移除 ${item.name}`} onClick={onRemove}>
        <X size={12} />
      </button>
      <small>{item.name}</small>
    </div>
  );
}
export function References({
  data,
  onChange,
}: {
  data: MediaData;
  onChange: (references: Reference[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  function add(files: FileList | null) {
    if (!files) return;
    const next = [...data.references];
    const issues: string[] = [];
    for (const file of Array.from(files)) {
      const type = file.type.split('/')[0];
      if (
        !['image', 'video', 'audio'].includes(type ?? '') ||
        (data.kind === 'image' && type !== 'image')
      ) {
        issues.push(`${file.name}：不支持此类型`);
        continue;
      }
      const kind = type as Reference['type'];
      const limit = kind === 'image' ? 32 : kind === 'video' ? 200 : 64;
      if (file.size > limit * 1024 * 1024) {
        issues.push(`${file.name}：超过 ${limit} MiB`);
        continue;
      }
      if (next.filter((r) => r.type === kind).length >= (kind === 'image' ? 16 : 3)) {
        issues.push(`${file.name}：超过素材数量上限`);
        continue;
      }
      next.push({ id: crypto.randomUUID(), name: file.name, type: kind, blob: file });
    }
    onChange(next);
    setError(issues.join('；'));
    if (input.current) input.current.value = '';
  }
  return (
    <div className="references">
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={data.kind === 'image' ? 'image/*' : 'image/*,video/*,audio/*'}
        aria-label="选择参考素材"
        onChange={(e) => add(e.target.files)}
      />
      <button
        type="button"
        className="reference-add"
        title="添加参考素材（仅保存在本机）"
        aria-label="添加参考素材"
        onClick={() => input.current?.click()}
      >
        <Plus size={24} strokeWidth={1.75} />
      </button>
      {data.references.map((item) => (
        <ReferencePreview
          key={item.id}
          item={item}
          onRemove={() => onChange(data.references.filter((r) => r.id !== item.id))}
        />
      ))}
      {error && (
        <p role="alert" className="reference-error">
          {error}
        </p>
      )}
    </div>
  );
}
