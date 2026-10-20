import { useState } from 'react';
import { Image, Video } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import type { MediaNode } from './types';
function Result({ requestId, kind }: { requestId: string; kind: 'image' | 'video' }) {
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const url = `jarvis-media://result/${requestId}?retry=${retry}`;
  if (error)
    return (
      <div className="result-error">
        <span>结果已生成，但媒体暂时无法加载</span>
        <button
          className="nodrag"
          onClick={() => {
            setRetry((n) => n + 1);
            setError(false);
          }}
        >
          重新加载媒体
        </button>
      </div>
    );
  return kind === 'image' ? (
    <img
      className="generated-image"
      src={url}
      alt="生成的图像"
      draggable={false}
      onError={() => setError(true)}
    />
  ) : (
    <video
      className="generated-video nodrag"
      src={url}
      controls
      preload="metadata"
      onError={() => setError(true)}
      aria-label="生成的视频"
    />
  );
}
export function MediaPlaceholder({ data, selected }: NodeProps<MediaNode>) {
  const Icon = data.kind === 'image' ? Image : Video;
  return (
    <div className="media-placeholder" data-selected={selected}>
      {data.result ? (
        <Result key={data.result.requestId} requestId={data.result.requestId} kind={data.kind} />
      ) : (
        <>
          <Icon size={24} strokeWidth={1.75} />
          <span>点击编辑{data.kind === 'image' ? '图像' : '视频'}</span>
        </>
      )}
      {data.generation && (
        <span className="node-task-status" role="status">
          {
            {
              uploading: '上传中',
              submitting: '提交中',
              running: '生成中',
              succeeded: '已完成',
              failed: '失败',
              unknown: '结果未知',
            }[data.generation.status]
          }
        </span>
      )}
    </div>
  );
}
