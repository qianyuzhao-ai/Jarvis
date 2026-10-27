import { IconButton } from '@jarvis/ui/components/Button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jarvis/ui/components/DropdownMenu';
import { toast } from '@jarvis/ui/components/Toast';
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from '@jarvis/ui/icons';

/** The canvas header's 更多 menu: Excel export and the canvas's snapping and dot-grid switches. */
export function CanvasMoreMenu({
  projectId,
  projectName,
  status,
  snap,
  dots,
  onSnap,
  onDots,
}: {
  projectId: string;
  projectName: string;
  status: string;
  snap: boolean;
  dots: boolean;
  onSnap: (value: boolean) => void;
  onDots: (value: boolean) => void;
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
        projectName: projectName.trim() || '未命名画布',
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton variant="ghost" size="icon" aria-label="更多" data-testid="canvas-more">
            <MoreHorizontal size={18} />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="canvas-more-menu">
          <DropdownMenuItem disabled={busy} onSelect={() => void exportExcel()}>
            {busy ? '正在导出…' : '导出 Excel'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={snap} onCheckedChange={(v) => onSnap(v === true)}>
            画布磁性吸附
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={dots} onCheckedChange={(v) => onDots(v === true)}>
            显示背景圆点
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
