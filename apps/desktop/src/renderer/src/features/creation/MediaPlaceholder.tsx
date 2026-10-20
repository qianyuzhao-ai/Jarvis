import { Image, Video } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import type { MediaNode } from './types';
import { UrlMedia } from './UrlMedia';
import { NodePorts } from './NodePorts';
import { NodeDownload } from './NodeDownload';
export function MediaPlaceholder({ data, selected, isConnectable }: NodeProps<MediaNode>) {
  const Icon = data.kind === 'image' ? Image : Video;
  return (
    <div className="media-placeholder" data-selected={selected} data-ready={Boolean(data.result)}>
      <NodePorts input enabled={isConnectable} />
      {data.result ? (
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
      {data.result && (
        <div className="asset-actions nodrag nopan">
          <NodeDownload key={data.result.url} url={data.result.url} kind={data.kind} />
        </div>
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
