import { useEffect } from 'react';
import { toast } from '@jarvis/ui/components/Toast';
export function GenerationNotice({
  notice,
  onDismiss,
}: {
  notice?: { id: string; text: string };
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (!notice) return;
    const id = toast({
      title: notice.text,
      testId: 'generation-notice',
      duration: Math.max(12_000, notice.text.length * 200),
      closeLabel: '关闭生成提醒',
      onDismiss: () => onDismiss(notice.id),
    });
    return () => toast.dismiss(id, false);
  }, [notice, onDismiss]);
  return null;
}
