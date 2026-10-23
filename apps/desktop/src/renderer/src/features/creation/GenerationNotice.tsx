import { useEffect } from 'react';
import { X } from 'lucide-react';

export function GenerationNotice({
  notice,
  onDismiss,
}: {
  notice?: { id: string; text: string };
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => onDismiss(notice.id),
      Math.max(12_000, notice.text.length * 200),
    );
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);
  if (!notice) return null;
  return (
    <div data-testid="generation-notice" className="generation-notice">
      <p role="status">{notice.text}</p>
      <button type="button" aria-label="关闭生成提醒" onClick={() => onDismiss(notice.id)}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
