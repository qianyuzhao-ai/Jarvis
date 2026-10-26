import { useContext, useEffect } from 'react';
import { Trash, CircleAlert, Copy } from '@jarvis/ui/icons';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { IconButton } from '@jarvis/ui/components/Button';
import { Badge } from '@jarvis/ui/components/Badge';
import { Spinner } from '@jarvis/ui/components/Spinner';
import { UrlMedia } from './UrlMedia';
import type { AssetNode as AssetNodeType, CanvasNode } from './types';
import { NodePorts } from './NodePorts';
import { NodeDownload } from './NodeDownload';
import { NodeName } from './NodeName';
import { NodeActionsContext, mediaHeight } from './node-actions-context';
export function AssetNode({
  id,
  data,
  selected,
  isConnectable,
  height = 180,
}: NodeProps<AssetNodeType>) {
  const flow = useReactFlow<CanvasNode>(),
    actions = useContext(NodeActionsContext),
    measure = actions?.measure;
  const url = data.upload.status === 'ready' ? data.upload.url : undefined;
  useEffect(() => {
    measure?.(id, 180);
  }, [id, url, measure]);
  return (
    <div
      data-testid="media-placeholder"
      data-node-kind="asset"
      className="media-placeholder asset-node"
      data-selected={selected}
      data-ready={data.upload.status === 'ready'}
      style={{ height }}
    >
      <NodePorts input={false} enabled={isConnectable} />
      {data.upload.status === 'ready' ? (
        <>
          <UrlMedia
            key={data.upload.url}
            url={data.upload.url}
            kind={data.kind}
            label={data.name}
            onDimensions={(w, h) => measure?.(id, mediaHeight(w, h))}
          />
          <Badge tone="neutral" appearance="solid" className="node-kind-badge">
            素材
          </Badge>
        </>
      ) : data.upload.status === 'failed' ? (
        <div
          data-testid="result-error"
          className="result-error node-state node-failed"
          role="alert"
        >
          <CircleAlert size={24} />
          <span>{data.upload.error}</span>
          <span>请重新拖入文件上传</span>
        </div>
      ) : (
        <div className="node-state" role="status">
          <Spinner size="lg" />
          <span>正在上传 {data.name}…</span>
        </div>
      )}
      {data.upload.status !== 'uploading' && (
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
            variant="ghost"
            size="icon-sm"
            aria-label={`复制资源 ${data.name}`}
            title="复制节点"
            onClick={(event) => {
              event.stopPropagation();
              actions?.duplicate(id);
            }}
          >
            <Copy size={16} />
          </IconButton>
          <IconButton
            variant="ghost"
            size="icon-sm"
            aria-label={`删除资源 ${data.name}`}
            onClick={(event) => {
              event.stopPropagation();
              void flow.deleteElements({ nodes: [{ id }] });
            }}
          >
            <Trash size={16} />
          </IconButton>
        </div>
      )}
      <NodeName id={id} name={data.name} />
    </div>
  );
}
