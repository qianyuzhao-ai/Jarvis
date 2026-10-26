import { useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Handle,
  Position,
  useReactFlow,
  useNodesInitialized,
  type NodeProps,
  type Node,
  type Edge,
} from '@xyflow/react';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Input } from '@jarvis/ui/components/Input';
import { Toggle } from '@jarvis/ui/components/Toggle';
import { Checkbox } from '@jarvis/ui/components/Checkbox';
import { Alert } from '@jarvis/ui/components/Alert';
import { ArrowLeft, Maximize, Sparkles, Play, Pause } from '@jarvis/ui/icons';
import type { GraphDot } from '../../../../../shared/writing-graph';
import { graphSubset, layoutGraph } from './graph-layout';
import { ResonanceCards } from './ResonanceCards';
import type { GraphWorkspace } from './use-writing-graph';
import './graph.css';
type DotNode = Node<{ dot: GraphDot; role: string; large: boolean }, 'dot'>;
function Dot({ data }: NodeProps<DotNode>) {
  return (
    <div
      className={`writing-dot is-${data.role} ${data.large ? 'is-large' : ''}`}
      title={data.dot.path}
    >
      <Handle type="target" position={Position.Left} />
      <span
        className="writing-dot-circle"
        style={{
          width: data.dot.inbound > 5 ? 18 : data.dot.inbound > 0 ? 12 : 8,
          height: data.dot.inbound > 5 ? 18 : data.dot.inbound > 0 ? 12 : 8,
        }}
      />
      <span className="writing-dot-label">{data.dot.title}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { dot: Dot };
function FitGraph({ signature }: { signature: string }) {
  const { fitView } = useReactFlow();
  const initialized = useNodesInitialized();
  useEffect(() => {
    if (initialized) void fitView({ padding: 0.2, maxZoom: 1, duration: 0 });
  }, [signature, initialized, fitView]);
  return null;
}
export default function GraphView({
  workspace,
  rootId,
  path,
  mini = false,
  onOpen,
  onExpand,
  onBack,
}: {
  workspace: GraphWorkspace;
  rootId: string;
  path: string;
  mini?: boolean;
  onOpen(path: string, newTab: boolean): void;
  onExpand(): void;
  onBack(): void;
}) {
  const [query, setQuery] = useState(''),
    [linksOn, setLinksOn] = useState(true),
    [tagsOn, setTagsOn] = useState(true),
    [isolated, setIsolated] = useState(false);
  const [time, setTime] = useState(100),
    [playing, setPlaying] = useState(false);
  const graph = workspace.graph;
  const times = graph?.dots.map((dot) => dot.firstSeen) ?? [];
  const start = Math.min(...times),
    end = Math.max(...times, ...(graph?.links.map((link) => link.firstSeen) ?? []));
  const cutoff = time === 100 ? Infinity : start + ((end - start) * time) / 100;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setTime((value) => Math.min(100, value + 2)), 250);
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (time === 100) setPlaying(false);
  }, [time]);
  const layout = useMemo(() => {
    if (!graph)
      return { dots: [] as GraphDot[], positions: new Map<string, { x: number; y: number }>() };
    const subset = graphSubset(graph, path, mini);
    const ids = new Set(subset.map((dot) => dot.path));
    const dots = [
      ...subset,
      ...graph.dots.filter(
        (dot) => !ids.has(dot.path) && workspace.candidates.some((item) => item.path === dot.path),
      ),
    ];
    const all = new Set(dots.map((dot) => dot.path));
    const links = graph.links.filter(
      (link): link is typeof link & { target: string } =>
        !!link.target && all.has(link.source) && all.has(link.target),
    );
    return { dots, positions: layoutGraph(dots, links, path) };
  }, [graph, path, mini, workspace.candidates]);
  const model = useMemo(() => {
    if (!graph) return { nodes: [] as DotNode[], edges: [] as Edge[] };
    const candidates = new Set(workspace.candidates.map((item) => item.path));
    const connected = new Set(
      graph.links.flatMap((link) => (link.target ? [link.source, link.target] : [])),
    );
    for (const group of graph.tags)
      if (group.paths.length > 1) for (const item of group.paths) connected.add(item);
    const dots = layout.dots.filter(
      (dot) =>
        dot.firstSeen <= cutoff &&
        (!isolated || !connected.has(dot.path)) &&
        (!query ||
          `${dot.title} ${dot.path}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
    );
    const ids = new Set(dots.map((dot) => dot.path));
    const edges: Edge[] = [];
    if (linksOn)
      for (const [i, link] of graph.links.entries())
        if (link.target && link.firstSeen <= cutoff && ids.has(link.source) && ids.has(link.target))
          edges.push({
            id: `link-${i}`,
            source: link.source,
            target: link.target,
            type: 'straight',
            className: 'writing-graph-edge',
          });
    if (tagsOn)
      for (const group of graph.tags) {
        const members = group.paths.filter((item) => ids.has(item));
        for (const target of members.slice(1))
          edges.push({
            id: `tag-${group.tag}-${target}`,
            source: members[0]!,
            target,
            type: 'straight',
            className: 'writing-graph-edge is-tag',
          });
      }
    if (ids.has(path))
      for (const target of candidates)
        if (ids.has(target))
          edges.push({
            id: `candidate-${target}`,
            source: path,
            target,
            type: 'straight',
            className: 'writing-graph-edge is-candidate',
          });
    const positions = layout.positions;
    return {
      nodes: dots.map((dot) => ({
        id: dot.path,
        type: 'dot' as const,
        position: positions.get(dot.path)!,
        data: {
          dot,
          large: !mini,
          role:
            dot.path === path
              ? 'active'
              : candidates.has(dot.path)
                ? 'candidate'
                : connected.has(dot.path)
                  ? 'connected'
                  : 'isolated',
        },
        ariaLabel: dot.title,
        connectable: true,
      })),
      edges,
    };
  }, [graph, path, mini, query, isolated, linksOn, tagsOn, cutoff, workspace.candidates, layout]);
  return (
    <section
      className={`writing-graph ${mini ? 'is-mini' : 'is-panorama'}`}
      aria-label={mini ? '星图小窗' : '全景星图'}
      data-testid={mini ? 'writing-graph-mini' : 'writing-graph-full'}
    >
      {!mini && (
        <div className="writing-graph-toolbar">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft />
            返回文档
          </Button>
          <Input
            aria-label="搜索星图"
            placeholder="搜索点…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Toggle size="sm" variant="outline" pressed={linksOn} onPressedChange={setLinksOn}>
            双链
          </Toggle>
          <Toggle size="sm" variant="outline" pressed={tagsOn} onPressedChange={setTagsOn}>
            标签
          </Toggle>
          <Checkbox
            label="只看孤岛"
            checked={isolated}
            onCheckedChange={(value) => setIsolated(value === true)}
          />
          <span>
            {model.nodes.length} 个点 · {model.edges.length} 条线
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!workspace.canFind}
            onClick={() => void workspace.find()}
          >
            <Sparkles />
            寻找共鸣点
          </Button>
        </div>
      )}
      {workspace.error && (
        <Alert tone="error" onDismiss={() => workspace.setError('')}>
          {workspace.error}
          <Button size="sm" variant="ghost" onClick={() => void workspace.refresh()}>
            重试
          </Button>
        </Alert>
      )}
      {graph?.truncated && (
        <p role="status" className="writing-graph-note">
          索引已截断：最多 20,000 条目，Markdown 最大 4 MiB。
        </p>
      )}
      <div className="writing-graph-canvas">
        {graph ? (
          <ReactFlow
            key={`${mini}:${rootId}`}
            nodes={model.nodes}
            edges={model.edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: mini ? 0.25 : 0.12, maxZoom: 1 }}
            minZoom={0.05}
            maxZoom={2}
            nodesDraggable={false}
            nodesConnectable
            elementsSelectable
            onNodeClick={(event, node) => onOpen(node.id, event.metaKey || event.ctrlKey)}
            onConnect={(connection) => {
              if (connection.source && connection.target)
                void workspace.change({
                  action: 'link',
                  rootId,
                  from: connection.source,
                  to: connection.target,
                });
            }}
            onlyRenderVisibleElements
            proOptions={{ hideAttribution: true }}
          >
            <FitGraph
              signature={model.nodes
                .map((node) => `${node.id}:${node.position.x}:${node.position.y}`)
                .join('|')}
            />
          </ReactFlow>
        ) : (
          <p className="writing-graph-empty">正在建立星图…</p>
        )}
        {graph && !model.edges.length && mini && (
          <p className="writing-graph-empty">这个文件还没有任何连接</p>
        )}
        {workspace.searching && (
          <p className="writing-graph-searching" role="status">
            正在寻找共鸣点…
          </p>
        )}
        {!mini && (
          <ResonanceCards workspace={workspace} rootId={rootId} path={path} onOpen={onOpen} />
        )}
      </div>
      {mini ? (
        <>
          <div className="writing-graph-legend">
            <span>● 当前</span>
            <span>● 已连接</span>
            <span>○ 孤岛</span>
          </div>
          <div className="writing-graph-mini-actions">
            <Button
              variant="secondary"
              size="sm"
              disabled={!workspace.canFind}
              onClick={() => void workspace.find()}
            >
              <Sparkles />
              寻找共鸣点
            </Button>
            <Button variant="ghost" size="sm" onClick={onExpand}>
              <Maximize />
              在编辑区展开全景
            </Button>
          </div>
        </>
      ) : (
        <div className="writing-graph-timeline">
          <IconButton
            variant="ghost"
            size="icon-sm"
            aria-label={playing ? '停止回放' : '播放时间轴'}
            onClick={() => {
              if (time === 100) setTime(0);
              setPlaying((value) => !value);
            }}
          >
            {playing ? <Pause /> : <Play />}
          </IconButton>
          <span>{Number.isFinite(start) ? new Date(start).toLocaleDateString() : '—'}</span>
          <input
            type="range"
            aria-label="星图时间轴"
            min={0}
            max={100}
            value={time}
            onChange={(e) => {
              setPlaying(false);
              setTime(Number(e.target.value));
            }}
          />
          <span>
            {time === 100
              ? '现在'
              : Number.isFinite(cutoff)
                ? new Date(cutoff).toLocaleDateString()
                : '—'}
          </span>
          <span>只读回放</span>
        </div>
      )}
    </section>
  );
}
