import { IconButton } from '@jarvis/ui/components/Button';
import { useRef, useState } from 'react';
import { Download, X } from '@jarvis/ui/icons';
import type { DownloadMedia } from '../../../../shared/generation';

export function NodeDownload({ url, kind, fileName }: DownloadMedia) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; message: string } | null>(null);
  async function download() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setNotice({ error: false, message: '正在下载…' });
    try {
      const response = await window.desktop!.generation.downloadMedia({ url, kind, fileName });
      if (!response.ok) throw new Error(response.error);
      setNotice({ error: false, message: response.value.canceled ? '已取消下载' : '已下载' });
    } catch (error) {
      setNotice({
        error: true,
        message: `下载失败：${error instanceof Error ? error.message : '请重试'}`,
      });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <IconButton
        variant="ghost"
        size="icon-sm"
        className="node-download-button"
        aria-label={`下载${{ image: '图像', video: '视频', audio: '音频' }[kind]}`}
        loading={busy}
        onClick={(event) => {
          event.stopPropagation();
          void download();
        }}
      >
        <Download size={16} />
      </IconButton>
      {notice && (
        <div
          data-testid="node-download-notice"
          className="node-download-notice"
          role={notice.error ? 'alert' : 'status'}
        >
          <span>{notice.message}</span>
          {!busy && (
            <IconButton
              variant="ghost"
              size="icon-sm"
              aria-label="关闭下载提示"
              onClick={(event) => {
                event.stopPropagation();
                setNotice(null);
              }}
            >
              <X size={14} />
            </IconButton>
          )}
        </div>
      )}
    </>
  );
}
