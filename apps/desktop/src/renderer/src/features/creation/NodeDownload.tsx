import { useRef, useState } from 'react';
import { Download, LoaderCircle, X } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
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
        className="node-download-button"
        label={kind === 'image' ? '下载图像' : '下载视频'}
        disabled={busy}
        aria-busy={busy}
        onClick={(event) => {
          event.stopPropagation();
          void download();
        }}
      >
        {busy ? <LoaderCircle size={16} /> : <Download size={16} />}
      </IconButton>
      {notice && (
        <div className="node-download-notice" role={notice.error ? 'alert' : 'status'}>
          <span>{notice.message}</span>
          {!busy && (
            <IconButton
              label="关闭下载提示"
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
