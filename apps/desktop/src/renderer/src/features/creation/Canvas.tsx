import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type NodeChange,
  type EdgeChange,
  type Connection,
  MarkerType,
  Position,
} from '@xyflow/react';
import {
  ChevronLeft,
  Image,
  LayoutGrid,
  Magnet,
  Map,
  Maximize,
  Minus,
  Plus,
  Video,
  Upload,
} from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import { MediaPlaceholder } from './MediaPlaceholder';
import { MediaEditor } from './MediaEditor';
import { AssetNode } from './AssetNode';
import { CanvasExport } from './CanvasExport';
import { generationBusy } from './useGeneration';
import { connectionIssue, relatedWorkflow } from './connections';
import {
  createMedia,
  type CanvasNode,
  type CanvasEdge,
  type MediaData,
  type MediaNode,
  type Project,
} from './types';
const nodeTypes = { media: MediaPlaceholder, asset: AssetNode };
type Props = {
  project: Project;
  onChange: (update: (project: Project) => Project) => void;
  onBack: () => void;
  theme: 'light' | 'dark';
  status: string;
  onGenerate: (nodeId: string) => void;
  onImport: (
    files: File[],
    point: { x: number; y: number },
    onNotice: (message: string) => void,
  ) => Promise<void>;
};
function CanvasContent({ project, onChange, onBack, theme, status, onGenerate, onImport }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [connectionNotice, setConnectionNotice] = useState('');
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [editorHeight, setEditorHeight] = useState(200);
  const container = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [importNotice, setImportNotice] = useState('');
  const flow = useReactFlow<CanvasNode>();
  const viewport = useViewport();
  const related = useMemo(
    () => relatedWorkflow(project.edges, selected),
    [project.edges, selected],
  );
  const edges = useMemo<CanvasEdge[]>(
    () =>
      project.edges.map((edge) => {
        const highlighted = related.links.has(edge.id);
        return {
          ...edge,
          sourceHandle: 'output',
          targetHandle: 'input',
          selected: edge.id === selectedEdge,
          animated: highlighted,
          className: `workflow-edge${highlighted ? ' workflow-edge-active' : ''}`,
          zIndex: 0,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: highlighted ? 'var(--color-accent)' : 'var(--workflow-edge)',
            width: 14,
            height: 14,
          },
        };
      }),
    [project.edges, related, selectedEdge],
  );
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const nodes = useMemo<CanvasNode[]>(
    () =>
      project.nodes.map((n) => ({
        ...n,
        selected: n.id === selected,
        className: related.nodes.has(n.id) ? 'workflow-node-related' : '',
        zIndex: 10,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        ariaLabel: `${{ image: '图像', video: '视频', audio: '音频' }[n.data.kind]}${n.type === 'asset' ? '资源' : ''}节点`,
        width: 360,
        height: 240,
        measured: { width: 360, height: 240 },
      })),
    [project.nodes, selected, related],
  );
  const active = nodes.find((n): n is MediaNode => n.id === selected && n.type === 'media');
  function importFiles(files: File[], screen: { x: number; y: number }) {
    const point = flow.screenToFlowPosition(screen, { snapToGrid: project.snap });
    setImportNotice('');
    void onImport(files, point, setImportNotice).catch(() =>
      setImportNotice('导入失败，请重新拖入文件'),
    );
  }
  const editorRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    let frame = 0;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => setEditorHeight(entry.contentRect.height));
      }
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  const patch = useCallback(
    (values: Partial<Project>) => onChange((p) => ({ ...p, ...values })),
    [onChange],
  );
  function add(kind: MediaData['kind']) {
    const element = container.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const point = flow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height * 0.38,
    });
    const position = { x: point.x - 180, y: point.y - 120 };
    while (
      project.nodes.some(
        (n) => Math.abs(n.position.x - position.x) < 30 && Math.abs(n.position.y - position.y) < 30,
      )
    ) {
      position.x += 48;
      position.y += 48;
    }
    const node: MediaNode = {
      id: crypto.randomUUID(),
      type: 'media',
      position,
      data: createMedia(kind),
    };
    onChange((p) => ({ ...p, nodes: [...p.nodes, node] }));
    setSelected(null);
  }
  function changes(items: NodeChange<CanvasNode>[]) {
    const persistent = items.filter((c) => {
      if (c.type === 'position') return true;
      if (c.type !== 'remove') return false;
      const node = project.nodes.find((n) => n.id === c.id);
      return node && !generationBusy(node.data);
    });
    const selection = items.find((c) => c.type === 'select' && c.selected);
    if (selection?.type === 'select') {
      setSelected(selection.id);
      setSelectedEdge(null);
    }
    if (!persistent.length) return;
    onChange((p) => {
      const next = applyNodeChanges(persistent, p.nodes).map(({ id, type, position, data }) =>
        type === 'asset'
          ? { id, type: 'asset' as const, position, data }
          : { id, type: 'media' as const, position, data },
      );
      const ids = new Set(next.map((node) => node.id));
      return {
        ...p,
        nodes: next,
        edges: p.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
      };
    });
  }
  function edgeChanges(items: EdgeChange<CanvasEdge>[]) {
    for (const change of items)
      if (change.type === 'select') {
        if (change.selected) setSelected(null);
        setSelectedEdge((previous) =>
          change.selected ? change.id : previous === change.id ? null : previous,
        );
      }
    const removed = new Set(
      items.flatMap((change) => (change.type === 'remove' ? [change.id] : [])),
    );
    if (removed.size)
      onChange((p) => ({ ...p, edges: p.edges.filter((edge) => !removed.has(edge.id)) }));
  }
  function connect(connection: Connection) {
    const issue = connectionIssue(project, connection);
    if (issue) {
      setConnectionNotice(issue);
      return;
    }
    setConnectionNotice('');
    const edge = { id: crypto.randomUUID(), source: connection.source, target: connection.target };
    onChange((p) => (connectionIssue(p, connection) ? p : { ...p, edges: [...p.edges, edge] }));
  }
  const left = active
    ? Math.max(
        16,
        Math.min(size.width - 776, viewport.x + (active.position.x + 180) * viewport.zoom - 380),
      )
    : 16;
  const below = active ? viewport.y + (active.position.y + 240) * viewport.zoom + 24 : 16;
  const above = active ? viewport.y + active.position.y * viewport.zoom - editorHeight - 24 : 16;
  const top = Math.max(
    16,
    below + editorHeight <= size.height - 80
      ? below
      : above >= 16
        ? above
        : Math.min(below, size.height - editorHeight - 80),
  );
  return (
    <main className="canvas-page" data-testid="canvas-page">
      <header className="canvas-toolbar window-drag" data-platform={window.desktop?.platform}>
        <div className="canvas-title">
          <IconButton label="返回项目列表" onClick={onBack}>
            <ChevronLeft size={18} />
          </IconButton>
          <input
            aria-label="项目名称"
            value={project.name}
            maxLength={80}
            onChange={(e) => patch({ name: e.target.value })}
            onBlur={() => {
              if (!project.name.trim()) patch({ name: '未命名项目' });
            }}
          />
        </div>
        <div className="canvas-create">
          <button onClick={() => add('image')}>
            <Image size={18} />
            图像
          </button>
          <button onClick={() => add('video')}>
            <Video size={18} />
            视频
          </button>
          <IconButton label="导入素材" onClick={() => fileInput.current?.click()}>
            <Upload size={18} />
          </IconButton>
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept="image/*,video/*,audio/*"
            aria-label="导入画布素材"
            onChange={(e) => {
              const rect = container.current?.getBoundingClientRect();
              if (rect)
                importFiles(Array.from(e.target.files ?? []), {
                  x: rect.left + rect.width / 2,
                  y: rect.top + rect.height / 2,
                });
              e.target.value = '';
            }}
          />
        </div>
        <CanvasExport
          key={project.id}
          projectId={project.id}
          projectName={project.name}
          status={status}
        />
      </header>
      <div
        className="canvas-body"
        ref={container}
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'none';
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          if (e.dataTransfer.files.length)
            importFiles(Array.from(e.dataTransfer.files), { x: e.clientX, y: e.clientY });
        }}
      >
        <ReactFlow<CanvasNode, CanvasEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={changes}
          onEdgesChange={edgeChanges}
          onConnect={connect}
          isValidConnection={(connection) => !connectionIssue(project, connection)}
          onConnectEnd={(_, state) => {
            if (state.isValid || !state.fromNode || !state.toNode) return;
            const forward = state.fromHandle?.type === 'source';
            const issue = connectionIssue(project, {
              source: forward ? state.fromNode.id : state.toNode.id,
              target: forward ? state.toNode.id : state.fromNode.id,
            });
            if (issue) setConnectionNotice(issue);
          }}
          defaultViewport={project.viewport}
          onMoveEnd={(_, v) => patch({ viewport: v })}
          onNodeClick={(_, n) => {
            setSelected(n.id);
            setSelectedEdge(null);
          }}
          onEdgeClick={(_, edge) => {
            setSelected(null);
            setSelectedEdge(edge.id);
          }}
          onPaneClick={() => {
            setSelected(null);
            setSelectedEdge(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSelected(null);
              setSelectedEdge(null);
            }
          }}
          snapToGrid={project.snap}
          snapGrid={[24, 24]}
          minZoom={0.15}
          maxZoom={2.5}
          deleteKeyCode={['Backspace', 'Delete']}
          colorMode={theme}
          zIndexMode="manual"
          elevateEdgesOnSelect={false}
          elevateNodesOnSelect={false}
          edgesReconnectable={false}
          connectionRadius={24}
          panOnScroll
          selectionOnDrag
          panOnDrag={[1, 2]}
          zoomOnDoubleClick={false}
          proOptions={{ hideAttribution: true }}
        >
          {project.dots && (
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--dot)" />
          )}
          {project.minimap && (
            <MiniMap
              className="canvas-minimap"
              pannable
              zoomable
              nodeColor="var(--color-secondary)"
              maskColor="var(--minimap-mask)"
              ariaLabel="画布缩略图"
            />
          )}
          <Panel position="bottom-left" className="floating-controls">
            <IconButton label="缩小" onClick={() => void flow.zoomOut()}>
              <Minus size={18} />
            </IconButton>
            <button className="zoom-value" title="重置为 100%" onClick={() => void flow.zoomTo(1)}>
              {Math.round(viewport.zoom * 100)}%
            </button>
            <IconButton label="放大" onClick={() => void flow.zoomIn()}>
              <Plus size={18} />
            </IconButton>
            <span className="control-divider" />
            <IconButton
              label="适应视图"
              onClick={() => void flow.fitView({ padding: 0.3, maxZoom: 1 })}
            >
              <Maximize size={18} />
            </IconButton>
          </Panel>
          <Panel position="bottom-right" className="floating-controls">
            <IconButton
              label="缩略图显示"
              aria-pressed={project.minimap}
              onClick={() => patch({ minimap: !project.minimap })}
            >
              <Map size={18} />
            </IconButton>
            <IconButton
              label="背景点阵显示"
              aria-pressed={project.dots}
              onClick={() => patch({ dots: !project.dots })}
            >
              <LayoutGrid size={18} />
            </IconButton>
            <IconButton
              label="磁力吸附"
              aria-pressed={project.snap}
              onClick={() => patch({ snap: !project.snap })}
            >
              <Magnet size={18} />
            </IconButton>
          </Panel>
        </ReactFlow>
        {connectionNotice && (
          <div className="canvas-import-notice" role="alert">
            {connectionNotice}
            <button onClick={() => setConnectionNotice('')}>关闭</button>
          </div>
        )}
        {dragging && (
          <div className="canvas-drop-hint" role="status">
            <Upload size={24} />
            <span>松开以上传图片、视频或音频</span>
          </div>
        )}
        {importNotice && (
          <div className="canvas-import-notice" role="alert">
            {importNotice}
            <button onClick={() => setImportNotice('')}>关闭</button>
          </div>
        )}
        {active && (
          <div ref={editorRef} className="editor-position" style={{ left, top }}>
            <MediaEditor
              key={active.id}
              data={active.data}
              connectedCount={project.edges.filter((edge) => edge.target === active.id).length}
              onGenerate={() => onGenerate(active.id)}
              onClose={() => setSelected(null)}
              onDelete={() => {
                onChange((p) => ({
                  ...p,
                  nodes: p.nodes.filter((n) => n.id !== active.id),
                  edges: p.edges.filter(
                    (edge) => edge.source !== active.id && edge.target !== active.id,
                  ),
                }));
                setSelected(null);
              }}
              onChange={(data) =>
                onChange((p) => ({
                  ...p,
                  nodes: p.nodes.map((n) =>
                    n.id === active.id && n.type === 'media' ? { ...n, data } : n,
                  ),
                }))
              }
            />
          </div>
        )}
      </div>
    </main>
  );
}
export function Canvas(props: Props) {
  return (
    <ReactFlowProvider key={props.project.id}>
      <CanvasContent {...props} />
    </ReactFlowProvider>
  );
}
