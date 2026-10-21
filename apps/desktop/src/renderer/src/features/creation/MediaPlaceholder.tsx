import { Image, LoaderCircle, Video } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import { mediaName, type MediaNode } from './types';
import { generationBusy } from './useGeneration';
import { UrlMedia } from './UrlMedia';
import { NodePorts } from './NodePorts';
import { NodeDownload } from './NodeDownload';
import { NodeName } from './NodeName';
export function MediaPlaceholder({ id, data, selected, isConnectable }: NodeProps<MediaNode>) {
  const busy = generationBusy(data);
  const name = mediaName(data);
  const Icon = data.kind === 'image' ? Image : Video;
  return (
    <div
      className="media-placeholder"
      data-selected={selected}
      data-ready={Boolean(data.result) && !busy}
    >
      <NodePorts input enabled={isConnectable} />
      {busy ? (
        <div className="node-generating" role="status" aria-live="polite">
          <LoaderCircle size={32} strokeWidth={1.75} aria-hidden="true" />
          <span>正在生成…</span>
        </div>
      ) : data.result ? (
        <UrlMedia
          key={data.result.url}
          url={data.result.url}
          kind={data.kind}
          label={data.kind === 'image' ? '生成的图像' : '生成的视频'}
        />
      ) : (
        <>
          <Icon size={24} strokeWidth={1.75} />
          <span>点击编辑{data.kind === 'image' ? '图像' : '视频'}</span>
        </>
      )}
      {data.result && !busy && (
        <div className="asset-actions nodrag nopan">
          <NodeDownload
            key={data.result.url}
            url={data.result.url}
            kind={data.kind}
            fileName={name}
          />
        </div>
      )}
      {data.generation && ['failed', 'unknown'].includes(data.generation.status) && (
        <span className="node-task-status" role="status">
          {data.generation.status === 'failed' ? '失败' : '结果未知'}
        </span>
      )}
      <NodeName id={id} name={name} />
    </div>
  );
}
