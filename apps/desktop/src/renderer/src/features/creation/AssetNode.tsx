import { Image, Music, Video, X, CircleAlert } from 'lucide-react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { IconButton } from '../../components/IconButton';
import { UrlMedia } from './UrlMedia';
import type { AssetNode as AssetNodeType, CanvasNode } from './types';
import { NodePorts } from './NodePorts';
import { NodeDownload } from './NodeDownload';
import { NodeName } from './NodeName';

export function AssetNode({ id, data, selected, isConnectable }: NodeProps<AssetNodeType>) {
  const flow = useReactFlow<CanvasNode>();
  const Icon = data.kind === 'image' ? Image : data.kind === 'video' ? Video : Music;
  return (
    <div
      className="media-placeholder asset-node"
      data-selected={selected}
      data-ready={data.upload.status === 'ready'}
    >
      <NodePorts input={false} enabled={isConnectable} />
      {data.upload.status === 'ready' ? (
        <UrlMedia key={data.upload.url} url={data.upload.url} kind={data.kind} label={data.name} />
      ) : data.upload.status === 'failed' ? (
        <div className="result-error" role="alert">
          <CircleAlert size={24} />
          <span>{data.upload.error}</span>
          <span>请重新拖入文件上传</span>
        </div>
      ) : (
        <>
          <Icon size={24} strokeWidth={1.75} />
          <span role="status">正在上传 {data.name}…</span>
        </>
      )}
      <div className="asset-actions nodrag nopan">
        {data.upload.status === 'ready' && (
          <NodeDownload
            key={data.upload.url}
            url={data.upload.url}
            kind={data.kind}
            fileName={data.name}
          />
        )}
        <IconButton
          label={`删除资源 ${data.name}`}
          onClick={() => void flow.deleteElements({ nodes: [{ id }] })}
        >
          <X size={16} />
        </IconButton>
      </div>
      <NodeName id={id} name={data.name} />
    </div>
  );
}
