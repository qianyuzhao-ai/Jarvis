import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import {
  Handle,
  Position,
  ReactFlow,
  type Node,
  type NodeProps,
  type Edge,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Network, Maximize } from '@jarvis/ui/icons';
import { Input } from '@jarvis/ui/components/Input';
import { Textarea } from '@jarvis/ui/components/Textarea';
import { Alert } from '@jarvis/ui/components/Alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@jarvis/ui/components/Dialog';
import { editMindMap, mindMapLayout, parseMindMap, type MindItem } from './mindmap';
type MindData = {
  label: string;
  level: string;
  editing: boolean;
  rename(label: string): void;
  cancel(): void;
};
function MindNode({ data }: NodeProps<Node<MindData>>) {
  const [label, setLabel] = useState(data.label);
  useEffect(() => setLabel(data.label), [data.label]);
  return (
    <div className={`writing-mind-node ${data.level}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      {data.editing ? (
        <Input
          aria-label="导图节点文字"
          className="nodrag nowheel"
          autoFocus
          value={label}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => data.rename(label)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              data.rename(label);
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              data.cancel();
            }
          }}
        />
      ) : (
        <span>{data.label}</span>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
const nodeTypes = { mindItem: MindNode };
function MindCanvas({
  code,
  onChange,
  expanded,
}: {
  code: string;
  onChange(code: string): void;
  expanded?: boolean;
}) {
  const [selected, setSelected] = useState('0'),
    [editing, setEditing] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null),
    flow = useRef<ReactFlowInstance<Node<MindData>> | null>(null);
  const items = parseMindMap(code),
    positions = mindMapLayout(items);
  const focus = () => requestAnimationFrame(() => host.current?.focus());
  const nodes: Node<MindData>[] = items.map((item) => ({
    id: item.id,
    type: 'mindItem',
    position: positions.get(item.id)!,
    selected: selected === item.id,
    style: {
      width: Math.max(
        80,
        Math.min(180, Array.from(item.label).length * 13 + (item.depth === 0 ? 32 : 24)),
      ),
    },
    data: {
      label: item.label,
      level: item.depth === 0 ? 'root' : item.depth === 1 ? 'branch' : 'leaf',
      editing: editing === item.id,
      rename: (label) => {
        if (label !== item.label) onChange(editMindMap(code, item.id, 'rename', label || '未命名'));
        setEditing(null);
        focus();
      },
      cancel: () => {
        setEditing(null);
        focus();
      },
    },
  }));
  const edges: Edge[] = items
    .filter((item) => item.parent !== null)
    .map((item) => ({
      id: `${item.parent}-${item.id}`,
      source: item.parent!,
      target: item.id,
      type: 'default',
      style: { stroke: 'var(--color-fg-tertiary)', strokeWidth: 1 },
    }));
  useEffect(() => {
    const frame = requestAnimationFrame(
      () => void flow.current?.fitView({ padding: 0.2, maxZoom: 1 }),
    );
    return () => cancelAnimationFrame(frame);
  }, [code]);
  function action(kind: 'child' | 'sibling' | 'delete') {
    const item = items.find((entry) => entry.id === selected) ?? items[0]!;
    let end = Number(item.id) + 1;
    while (end < items.length && items[end]!.depth > item.depth) end++;
    const next = editMindMap(code, item.id, kind);
    if (next === code) return;
    onChange(next);
    if (kind === 'delete') {
      setSelected(item.parent ?? '0');
      setEditing(null);
    } else {
      setSelected(String(end));
      setEditing(String(end));
    }
  }
  return (
    <>
      <div className="writing-rich-toolbar">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => void flow.current?.fitView({ padding: 0.2, maxZoom: 1 })}
        >
          适应视图
        </Button>
        <Button variant="ghost" size="xs" onClick={() => action('child')}>
          添加子节点
        </Button>
        <span className="writing-rich-hint">Tab 子节点 · Enter 同级 · Delete 删除</span>
      </div>
      <div
        ref={host}
        tabIndex={0}
        role="application"
        aria-label="思维导图画布"
        className={`writing-mind-canvas ${expanded ? 'expanded' : ''}`}
        onKeyDown={(e) => {
          if (
            e.nativeEvent.isComposing ||
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
          )
            return;
          if (['Tab', 'Enter', 'Delete', 'Backspace'].includes(e.key)) {
            e.preventDefault();
            e.stopPropagation();
            action(e.key === 'Tab' ? 'child' : e.key === 'Enter' ? 'sibling' : 'delete');
          }
          if (e.key.startsWith('Arrow')) {
            e.preventDefault();
            const index = items.findIndex((item) => item.id === selected),
              item = items[index] ?? items[0]!;
            const next =
              e.key === 'ArrowLeft'
                ? item.parent
                : e.key === 'ArrowRight'
                  ? items.find((child) => child.parent === item.id)?.id
                  : items[
                      Math.max(
                        0,
                        Math.min(items.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)),
                      )
                    ]?.id;
            if (next) setSelected(next);
          }
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          disableKeyboardA11y
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          onInit={(instance) => {
            flow.current = instance;
          }}
          onNodeClick={(_event, node) => {
            setSelected(node.id);
            focus();
          }}
          onNodeDoubleClick={(_event, node) => {
            setSelected(node.id);
            setEditing(node.id);
          }}
          proOptions={{ hideAttribution: true }}
        />
      </div>
    </>
  );
}
export function MindMapView({ node, updateAttributes }: NodeViewProps) {
  const [source, setSource] = useState(false),
    [wide, setWide] = useState(false),
    [expanded, setExpanded] = useState(false);
  const code = String(node.attrs.code);
  let error = '',
    items: MindItem[] = [];
  try {
    items = parseMindMap(code);
  } catch (reason) {
    error = reason instanceof Error ? reason.message : '导图格式无法解析';
  }
  const onChange = (value: string) => updateAttributes({ code: value });
  return (
    <NodeViewWrapper
      className={`writing-rich-block ${wide ? 'is-wide' : ''}`}
      contentEditable={false}
      data-testid="writing-mindmap"
    >
      <div className="writing-rich-toolbar">
        <Network size={14} />
        <span>思维导图{items.length ? ` · ${items.length} 个节点` : ''}</span>
        <Button variant="ghost" size="xs" onClick={() => setSource(!source)}>
          {source ? '查看导图' : '编辑导图源码'}
        </Button>
        <Button variant="ghost" size="xs" aria-pressed={wide} onClick={() => setWide(!wide)}>
          {wide ? '正文宽度' : '全宽'}
        </Button>
        <IconButton
          variant="ghost"
          size="icon-xs"
          aria-label="全屏编辑"
          disabled={!!error}
          onClick={() => setExpanded(true)}
        >
          <Maximize size={14} />
        </IconButton>
      </div>
      {error && <Alert tone="warning">{error}，已按代码显示。</Alert>}
      {source || error ? (
        <Textarea
          aria-label="思维导图源码"
          className="writing-code-source"
          rows={6}
          value={code}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <MindCanvas code={code} onChange={onChange} />
      )}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="writing-diagram-dialog">
          <DialogHeader>
            <DialogTitle>思维导图</DialogTitle>
          </DialogHeader>
          {expanded && !error && <MindCanvas code={code} onChange={onChange} expanded />}
        </DialogContent>
      </Dialog>
    </NodeViewWrapper>
  );
}
