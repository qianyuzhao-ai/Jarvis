import { Button } from '@jarvis/ui/components/Button';
import { createPortal } from 'react-dom';
import { Alert } from '@jarvis/ui/components/Alert';
import { BadgeCount } from '@jarvis/ui/components/Badge';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { DownloadMedia } from '../../../../shared/generation';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  applyNodeChanges,
  useReactFlow,
  useStoreApi,
  SelectionMode,
  useViewport,
  type NodeChange,
  type EdgeChange,
  type Connection,
  MarkerType,
  Position,
} from '@xyflow/react';
import {
  Download,
  Image,
  LayoutGrid,
  Magnet,
  Map,
  Maximize,
  Minus,
  Plus,
  Video,
  Upload,
  Link2,
} from '@jarvis/ui/icons';
import { IconButton } from '../../components/IconButton';
import { MediaPlaceholder } from './MediaPlaceholder';
import { MediaEditor } from './MediaEditor';
import { AssetNode } from './AssetNode';
import { NodeRenameContext } from './node-rename-context';
import { CanvasExport } from './CanvasExport';
import { CanvasAgentSidebar } from './CanvasAgentSidebar';
import { useCanvasHost } from './use-canvas-host';
import { promptMentions } from './prompt-mentions';
import { generationBusy } from './useGeneration';
import { connectSelected, connectionIssue, relatedWorkflow } from './connections';
import {
  createMedia,
  mediaName,
  type CanvasNode,
  type CanvasEdge,
  type MediaData,
  type MediaNode,
  type Project,
} from './types';
const nodeTypes = { media: MediaPlaceholder, asset: AssetNode };
type Props = {
  shell: {
    active: boolean;
    rightHost: HTMLElement | null;
    open: boolean;
    width: number;
    onClose: () => void;
    onWidth: (n: number) => void;
  };
  project: Project;
  onChange: (update: (project: Project) => Project) => void;
  onCommit: (update: (project: Project) => Project) => Promise<void>;
  onConfigureAgent: () => void;
  agentBusy: boolean;
  theme: 'light' | 'dark';
  status: string;
  onGenerate: (nodeId: string) => void;
  onImport: (
    files: File[],
    point: { x: number; y: number },
    onNotice: (message: string) => void,
  ) => Promise<void>;
};
function CanvasContent({
  shell,
  project,
  onChange,
  onCommit,
  onConfigureAgent,
  theme,
  status,
  onGenerate,
  onImport,
}: Props) {
  const agentOpen = shell.open;
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [connectingIds, setConnectingIds] = useState<string[] | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const batchPending = useRef(false);
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
  const store = useStoreApi<CanvasNode, CanvasEdge>();
  const focusNodes = useCallback(
    (ids: string[]) => {
      const existing = ids.filter((id) => project.nodes.some((n) => n.id === id));
      if (existing.length !== ids.length) setConnectionNotice('部分节点已不存在');
      if (!existing.length) return;
      setSelectedIds(existing);
      setEditorId(null);
      void flow.fitView({
        nodes: existing.map((id) => ({ id })),
        padding: 0.3,
        maxZoom: 1.2,
        duration: 0,
      });
    },
    [flow, project.nodes],
  );
  useCanvasHost(project, onCommit, focusNodes, setConnectionNotice);

  useEffect(
    () =>
      store.subscribe((state, previous) => {
        const rect = state.userSelectionRect;
        if (!rect || !state.userSelectionActive || rect === previous.userSelectionRect) return;
        const [panX, panY, zoom] = state.transform;
        const selection = {
          x: (rect.x - panX) / zoom,
          y: (rect.y - panY) / zoom,
          width: rect.width / zoom,
          height: rect.height / zoom,
        };
        const ids: string[] = [];
        for (const node of state.nodeLookup.values()) {
          if (node.hidden || node.selectable === false) continue;
          const { x, y } = node.internals.positionAbsolute;
          const { width = 0, height = 0 } = node.measured;
          const overlapWidth = Math.max(
            0,
            Math.min(x + width, selection.x + selection.width) - Math.max(x, selection.x),
          );
          const overlapHeight = Math.max(
            0,
            Math.min(y + height, selection.y + selection.height) - Math.max(y, selection.y),
          );
          if (width > 0 && height > 0 && overlapWidth * overlapHeight >= width * height * 0.5)
            ids.push(node.id);
        }
        // React Flow mutates candidate selections before publishing the rectangle.
        // Reapply our area threshold even when the matching IDs have not changed.
        setSelectedIds(ids);
        setEditorId(null);
        setSelectedEdge(null);
        setConnectingIds(null);
      }),
    [store],
  );
  const reducedMotion = useReducedMotion();
  const viewport = useViewport();
  const selected = selectedIds.length === 1 ? selectedIds[0]! : null;
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
          domAttributes: {
            'aria-description': highlighted ? 'highlighted' : 'idle',
          },
          zIndex: 0,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: highlighted ? 'var(--legacy-color-accent)' : 'var(--workflow-edge)',
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
        selected: selectedIds.includes(n.id),
        zIndex: 10,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        ariaLabel: `${{ image: '图像', video: '视频', audio: '音频' }[n.data.kind]}${n.type === 'asset' ? '资源' : ''}节点`,
        width: 360,
        height: 240,
        measured: { width: 360, height: 240 },
      })),
    [project.nodes, selectedIds],
  );
  const active = nodes.find((n): n is MediaNode => n.id === editorId && n.type === 'media');
  const downloadable: DownloadMedia[] = project.nodes.flatMap((node): DownloadMedia[] => {
    if (!selectedIds.includes(node.id)) return [];
    if (node.type === 'asset')
      return node.data.upload.status === 'ready'
        ? [{ url: node.data.upload.url, kind: node.data.kind, fileName: node.data.name }]
        : [];
    return node.data.result
      ? [{ url: node.data.result.url, kind: node.data.kind, fileName: mediaName(node.data) }]
      : [];
  });
  async function downloadSelected() {
    if (batchPending.current) return;
    batchPending.current = true;
    setBatchBusy(true);
    let completed = 0;
    let failed = 0;
    let canceled = false;
    const skipped = selectedIds.length - downloadable.length;
    try {
      for (const request of downloadable) {
        try {
          const response = await window.desktop!.generation.downloadMedia(request);
          if (!response.ok) throw new Error(response.error);
          if (response.value.canceled) {
            canceled = true;
            break;
          }
          completed++;
        } catch {
          failed++;
        }
      }
      setConnectionNotice(
        `批量下载：已下载 ${completed} 个，跳过 ${skipped} 个，失败 ${failed} 个${canceled ? '；已取消后续下载' : ''}`,
      );
    } finally {
      batchPending.current = false;
      setBatchBusy(false);
    }
  }
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
    setSelectedIds([]);
    setEditorId(null);
  }
  function changes(items: NodeChange<CanvasNode>[]) {
    const persistent = items.filter((c) => {
      if (c.type === 'position') return true;
      if (c.type !== 'remove') return false;
      const node = project.nodes.find((n) => n.id === c.id);
      return node && !generationBusy(node.data);
    });
    const selections = items.filter((c) => c.type === 'select');
    if (selections.length && !connectingIds && !store.getState().userSelectionRect) {
      setSelectedIds((previous) => {
        const next = new Set(previous);
        for (const change of selections)
          if (change.type === 'select') {
            if (change.selected) next.add(change.id);
            else next.delete(change.id);
          }
        return [...next];
      });
      setEditorId(null);
      if (selections.some((change) => change.type === 'select' && change.selected))
        setSelectedEdge(null);
    }
    if (!persistent.length) return;
    if (persistent.some((change) => change.type === 'remove')) {
      const removed = new Set(
        persistent.flatMap((change) => (change.type === 'remove' ? [change.id] : [])),
      );
      setSelectedIds((previous) => previous.filter((id) => !removed.has(id)));
      if (editorId && removed.has(editorId)) setEditorId(null);
    }
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
      if (change.type === 'select' && !store.getState().userSelectionRect) {
        if (change.selected) {
          setSelectedIds([]);
          setEditorId(null);
        }
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
  function connectTo(target: string) {
    if (!connectingIds) return;
    const result = connectSelected(project, connectingIds, target);
    if (result.issue) {
      setConnectionNotice(`无法连接全部 ${connectingIds.length} 个节点：${result.issue}`);
      return;
    }
    onChange((current) => connectSelected(current, connectingIds, target).project);
    setConnectionNotice(`已连接 ${connectingIds.length} 个节点`);
    setSelectedIds(connectingIds);
    setConnectingIds(null);
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
      <header
        data-testid="canvas-toolbar"
        className="canvas-toolbar window-drag"
        data-platform={window.desktop?.platform}
      >
        <div className="canvas-title">
          <input
            aria-label="项目名称"
            value={project.name}
            maxLength={80}
            onChange={(e) => patch({ name: e.target.value })}
            onBlur={() => {
              if (!project.name.trim()) patch({ name: '未命名项目' });
            }}
          />
          <span className="canvas-save-label">{status}</span>
        </div>
        <div className="canvas-create">
          <Button variant="secondary" size="sm" onClick={() => add('image')}>
            <Image size={18} />
            图像
          </Button>
          <Button variant="secondary" size="sm" onClick={() => add('video')}>
            <Video size={18} />
            视频
          </Button>
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
      <div className="canvas-workspace">
        <div
          data-testid="canvas-body"
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
            onNodeClick={(event, n) => {
              if (connectingIds) {
                connectTo(n.id);
                return;
              }
              if (event.shiftKey || event.metaKey || event.ctrlKey) return;
              setSelectedIds([n.id]);
              setEditorId(n.type === 'media' ? n.id : null);
              setSelectedEdge(null);
            }}
            onEdgeClick={(_, edge) => {
              setSelectedIds([]);
              setEditorId(null);
              setConnectingIds(null);
              setSelectedEdge(edge.id);
            }}
            onPaneClick={() => {
              setSelectedIds([]);
              setEditorId(null);
              setConnectingIds(null);
              setSelectedEdge(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSelectedIds([]);
                setEditorId(null);
                setConnectingIds(null);
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
            selectionMode={SelectionMode.Partial}
            selectionOnDrag
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
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
              <button
                data-testid="zoom-value"
                className="zoom-value"
                title="重置为 100%"
                onClick={() => void flow.zoomTo(1)}
              >
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
          {selectedIds.length > 1 && (
            <div className="canvas-selection-actions" role="toolbar" aria-label="多选节点操作">
              <span>已选择 {selectedIds.length} 个节点</span>
              <button
                type="button"
                aria-pressed={Boolean(connectingIds)}
                onClick={() => {
                  setEditorId(null);
                  setConnectingIds(connectingIds ? null : selectedIds);
                  setConnectionNotice('');
                }}
              >
                <Link2 size={16} />
                {connectingIds ? '取消连接' : '连接到节点'}
              </button>
              <button
                type="button"
                disabled={batchBusy || !downloadable.length}
                aria-label={batchBusy ? '正在下载' : `下载可用文件 (${downloadable.length})`}
                title={batchBusy ? '正在下载' : `下载 ${downloadable.length} 个可用文件`}
                aria-busy={batchBusy}
                onClick={() => void downloadSelected()}
              >
                <Download size={16} aria-hidden="true" />
                <BadgeCount
                  tone="accent"
                  count={downloadable.length}
                  aria-label={`${downloadable.length} 个可下载文件`}
                />
              </button>
              {connectingIds && <span>点击目标图像或视频节点</span>}
            </div>
          )}
          {connectionNotice && (
            <Alert
              tone="error"
              data-testid="canvas-import-notice"
              className="canvas-import-notice"
              onDismiss={() => setConnectionNotice('')}
              closeLabel="关闭"
            >
              {connectionNotice}
            </Alert>
          )}
          {dragging && (
            <div data-testid="canvas-drop-hint" className="canvas-drop-hint" role="status">
              <Upload size={24} />
              <span>松开以上传图片、视频或音频</span>
            </div>
          )}
          {importNotice && (
            <Alert
              tone="error"
              data-testid="canvas-import-notice"
              className="canvas-import-notice"
              onDismiss={() => setImportNotice('')}
              closeLabel="关闭"
            >
              {importNotice}
            </Alert>
          )}
          {active && (
            <motion.div
              ref={editorRef}
              className="editor-position"
              style={{ left, top }}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={
                reducedMotion ? { duration: 0 } : { duration: 0.18, ease: [0.32, 0.72, 0, 1] }
              }
            >
              <MediaEditor
                key={active.id}
                data={active.data}
                mentions={promptMentions(project, active)}
                connectedCount={project.edges.filter((edge) => edge.target === active.id).length}
                onGenerate={() => onGenerate(active.id)}
                onClose={() => setEditorId(null)}
                onDelete={() => {
                  onChange((p) => ({
                    ...p,
                    nodes: p.nodes.filter((n) => n.id !== active.id),
                    edges: p.edges.filter(
                      (edge) => edge.source !== active.id && edge.target !== active.id,
                    ),
                  }));
                  setSelectedIds([]);
                  setEditorId(null);
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
            </motion.div>
          )}
        </div>
        {shell.rightHost &&
          createPortal(
            <div hidden={!shell.active}>
              {' '}
              <CanvasAgentSidebar
                key={project.id}
                project={project}
                selectedIds={selectedIds}
                open={agentOpen}
                width={shell.width}
                onWidth={shell.onWidth}
                onClose={shell.onClose}
                focus={focusNodes}
                commit={onCommit}
                configure={onConfigureAgent}
              />
            </div>,
            shell.rightHost,
          )}
      </div>
    </main>
  );
}
export function Canvas(props: Props) {
  const rename = useCallback(
    (id: string, name: string) => {
      props.onChange((project) => ({
        ...project,
        nodes: project.nodes.map((node) =>
          node.id !== id
            ? node
            : node.type === 'asset'
              ? { ...node, data: { ...node.data, name } }
              : { ...node, data: { ...node.data, name } },
        ),
      }));
    },
    [props.onChange],
  );
  return (
    <NodeRenameContext value={rename}>
      <ReactFlowProvider key={props.project.id}>
        <CanvasContent {...props} />
      </ReactFlowProvider>
    </NodeRenameContext>
  );
}
