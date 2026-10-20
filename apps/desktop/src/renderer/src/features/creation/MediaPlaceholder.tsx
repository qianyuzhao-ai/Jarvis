import { Image, Video } from 'lucide-react';
import type { NodeProps } from '@xyflow/react';
import type { MediaNode } from './types';
export function MediaPlaceholder({ data, selected }: NodeProps<MediaNode>) {
  const Icon = data.kind === 'image' ? Image : Video;
  return (
    <div className="media-placeholder" data-selected={selected}>
      <Icon size={24} strokeWidth={1.75} />
      <span>点击编辑{data.kind === 'image' ? '图像' : '视频'}</span>
    </div>
  );
}
