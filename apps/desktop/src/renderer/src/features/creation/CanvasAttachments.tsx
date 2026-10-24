import { X } from '@jarvis/ui/icons';
import type { CanvasAttachment } from './use-canvas-attachments';
export function CanvasAttachments({
  entries,
  preparing,
  remove,
  focus,
}: {
  entries: CanvasAttachment[];
  preparing: boolean;
  remove: (id: string) => void;
  focus: (ids: string[]) => void;
}) {
  if (!entries.length) return null;
  return (
    <div
      data-testid="canvas-attachments"
      className="canvas-attachments"
      aria-label="待发送画布资产"
    >
      {entries.map((entry) => (
        <div
          data-testid="canvas-attachment"
          className="canvas-attachment"
          key={entry.nodeId}
          data-status={entry.status}
        >
          <button
            type="button"
            className="canvas-attachment-preview"
            onClick={() => focus([entry.nodeId])}
          >
            {entry.images[0] ? (
              <img src={entry.images[0].preview} alt={entry.name} width={40} height={40} />
            ) : (
              <span>资产</span>
            )}
            <span>
              {entry.name}
              <small>
                {entry.status === 'preparing'
                  ? '正在准备…'
                  : entry.status === 'failed'
                    ? entry.error
                    : entry.images[0]?.kind === 'video-frame'
                      ? `视频 · ${entry.images.length} 帧`
                      : '图片'}
              </small>
            </span>
          </button>
          <button
            type="button"
            disabled={preparing}
            aria-label={`移除待发送资产：${entry.name}`}
            onClick={() => remove(entry.nodeId)}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
