import { useContext, useEffect, useState } from 'react';
import { Image, Video, CircleAlert, Trash } from '@jarvis/ui/icons';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Badge } from '@jarvis/ui/components/Badge';
import { Spinner } from '@jarvis/ui/components/Spinner';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import { mediaName, type MediaNode, type CanvasNode } from './types';
import { generationBusy } from './useGeneration';
import { UrlMedia } from './UrlMedia';
import { NodePorts } from './NodePorts';
import { NodeDownload } from './NodeDownload';
import { NodeName } from './NodeName';
import { NodeActionsContext, mediaHeight, mediaTime } from './node-actions-context';
export function MediaPlaceholder({
  id,
  data,
  selected,
  isConnectable,
  height = 180,
}: NodeProps<MediaNode>) {
  const busy = generationBusy(data),
    name = mediaName(data),
    Icon = data.kind === 'image' ? Image : Video;
  const actions = useContext(NodeActionsContext),
    flow = useReactFlow<CanvasNode>();
  const [now, setNow] = useState(Date.now);
  const measure = actions?.measure;
  useEffect(() => {
    measure?.(id, 180);
  }, [id, data.result?.url, busy, measure]);
  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  const failed = data.generation?.status === 'failed',
    unknown = data.generation?.status === 'unknown';
  const retry = (event: React.MouseEvent) => {
    event.stopPropagation();
    actions?.generate(id);
  };
  return (
    <div
      data-testid="media-placeholder"
      className="media-placeholder"
      data-selected={selected}
      data-ready={!!data.result && !busy}
      style={{ height }}
    >
      <NodePorts input enabled={isConnectable} />
      {busy ? (
        <div
          data-testid="node-generating"
          className="node-generating node-state"
          role="status"
          aria-live="off"
        >
          <Spinner size="lg" />
          <span>正在生成 · 已 {mediaTime((now - (data.generation?.startedAt ?? now)) / 1000)}</span>
        </div>
      ) : unknown ? (
        <div className="node-state node-unknown">
          <CircleAlert size={24} />
          <strong data-testid="node-task-status">结果未知</strong>
          <span>上游可能已经生成并计费，重新生成前请先核实</span>
          <Button
            className="nodrag nopan"
            variant="secondary"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              actions?.details(id);
            }}
          >
            查看任务信息
          </Button>
        </div>
      ) : data.result ? (
        <>
          <UrlMedia
            key={data.result.url}
            url={data.result.url}
            kind={data.kind}
            label={data.kind === 'image' ? '生成的图像' : '生成的视频'}
            onDimensions={(w, h) => measure?.(id, mediaHeight(w, h))}
          />
          {failed && (
            <>
              <Badge
                data-testid="node-task-status"
                tone="danger"
                appearance="solid"
                className="node-kind-badge"
              >
                失败
              </Badge>
              <div className="node-failure-strip">
                <CircleAlert size={14} />
                <span title={data.generation?.error}>{data.generation?.error ?? '生成失败'}</span>
                <Button className="nodrag nopan" variant="secondary" size="xs" onClick={retry}>
                  重试
                </Button>
              </div>
            </>
          )}
        </>
      ) : failed ? (
        <div className="node-state node-failed">
          <CircleAlert size={24} />
          <strong data-testid="node-task-status">生成失败</strong>
          <span>{data.generation?.error ?? '请检查参数后重试'}</span>
          <Button className="nodrag nopan" variant="secondary" size="sm" onClick={retry}>
            重试
          </Button>
        </div>
      ) : (
        <div className="node-state">
          <Icon size={24} />
          <span>点击编辑{data.kind === 'image' ? '图像' : '视频'}</span>
        </div>
      )}
      {!busy && (
        <div className="asset-actions nodrag nopan">
          {data.result && (
            <NodeDownload
              key={data.result.url}
              url={data.result.url}
              kind={data.kind}
              fileName={name}
            />
          )}
          <IconButton
            variant="ghost"
            size="icon-sm"
            aria-label="删除节点"
            onClick={(event) => {
              event.stopPropagation();
              void flow.deleteElements({ nodes: [{ id }] });
            }}
          >
            <Trash size={16} />
          </IconButton>
        </div>
      )}
      <NodeName id={id} name={name} />
    </div>
  );
}
