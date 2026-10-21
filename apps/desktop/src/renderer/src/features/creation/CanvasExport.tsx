import { useRef, useState } from 'react';
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
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  async function exportExcel() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await window.desktop!.generation.exportProject({
        projectId,
        projectName: projectName.trim() || '未命名项目',
      });
      if (!result.ok) throw new Error(result.error);
      setFeedback({ error: false, message: result.value.canceled ? '已取消导出' : 'Excel 已导出' });
    } catch (error) {
      setFeedback({
        error: true,
        message: `导出失败：${error instanceof Error ? error.message : '请重试'}`,
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="canvas-status">
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

      {feedback && (
        <div className="canvas-export-feedback" role={feedback.error ? 'alert' : 'status'}>
          <span>{feedback.message}</span>
          <button type="button" onClick={() => setFeedback(null)}>
            关闭
          </button>
        </div>
      )}
    </div>
  );
}
