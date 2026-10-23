import { toast } from '@jarvis/ui/components/Toast';
import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';

export function CanvasExport({
  projectId,
  projectName,
  status,
}: {
  projectId: string;
  projectName: string;
  status: string;
}) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const notification = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      if (notification.current) toast.dismiss(notification.current);
    },
    [],
  );
  async function exportExcel() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    if (notification.current) toast.dismiss(notification.current);
    const id = toast({
      title: '正在导出…',
      tone: 'loading',
      testId: 'canvas-export-feedback',
      closeLabel: '关闭',
    });
    notification.current = id;
    try {
      const result = await window.desktop!.generation.exportProject({
        projectId,
        projectName: projectName.trim() || '未命名项目',
      });
      if (!result.ok) throw new Error(result.error);
      toast.update(id, {
        tone: result.value.canceled ? 'info' : 'success',
        title: result.value.canceled ? '已取消导出' : 'Excel 已导出',
      });
    } catch (error) {
      toast.update(id, {
        tone: 'error',
        title: `导出失败：${error instanceof Error ? error.message : '请重试'}`,
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div data-testid="canvas-status" className="canvas-status">
      <span className="sr-only" role="status">
        {status}
      </span>
      <button
        className="canvas-export-button"
        type="button"
        disabled={busy}
        aria-label="导出 Excel"
        onClick={() => void exportExcel()}
      >
        <Download size={16} />
        <span>{busy ? '正在导出…' : '导出 Excel'}</span>
      </button>
    </div>
  );
}
