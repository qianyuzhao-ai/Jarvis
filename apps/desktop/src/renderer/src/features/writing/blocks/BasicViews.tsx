import { useEffect, useRef, useState } from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Input } from '@jarvis/ui/components/Input';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import {
  ChevronDown,
  ChevronRight,
  Info,
  Lightbulb,
  Sparkles,
  TriangleAlert,
  CircleAlert,
  Copy,
} from '@jarvis/ui/icons';
import { toast } from '@jarvis/ui/components/Toast';
const labels: Record<string, string> = {
  note: '说明',
  tip: '提示',
  important: '重要',
  warning: '警告',
  caution: '注意',
  custom: '自定义',
};
export function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const tone = String(node.attrs.tone),
    Icon =
      {
        note: Info,
        tip: Lightbulb,
        important: Sparkles,
        warning: TriangleAlert,
        caution: CircleAlert,
      }[tone] ?? Lightbulb;
  return (
    <NodeViewWrapper className="writing-callout" data-tone={tone} data-testid="writing-callout">
      <div contentEditable={false} className="writing-rich-heading">
        {tone === 'custom' ? (
          <Input
            aria-label="高亮框图标"
            className="writing-callout-emoji"
            maxLength={16}
            value={node.attrs.emoji}
            onChange={(e) => updateAttributes({ emoji: e.target.value })}
          />
        ) : (
          <Icon size={18} />
        )}
        <Input
          appearance="ghost"
          aria-label="高亮框标题"
          value={node.attrs.title}
          placeholder={labels[tone]}
          onChange={(e) => updateAttributes({ title: e.target.value })}
        />
        <NativeSelect
          aria-label="高亮框类型"
          value={tone}
          onChange={(e) => updateAttributes({ tone: e.target.value })}
        >
          {Object.entries(labels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <NodeViewContent className="writing-rich-content" />
    </NodeViewWrapper>
  );
}
export function ToggleView({ node, updateAttributes }: NodeViewProps) {
  const [open, setOpen] = useState(true);
  return (
    <NodeViewWrapper className="writing-toggle" data-testid="writing-toggle">
      <div className="writing-rich-heading" contentEditable={false}>
        <IconButton
          aria-label={open ? '折叠内容' : '展开内容'}
          aria-expanded={open}
          variant="ghost"
          size="icon-xs"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}
        </IconButton>
        <Input
          appearance="ghost"
          aria-label="折叠块标题"
          value={node.attrs.summary}
          onChange={(e) => updateAttributes({ summary: e.target.value })}
        />
      </div>
      <NodeViewContent hidden={!open} className="writing-toggle-content" />
    </NodeViewWrapper>
  );
}
const codeLanguages = [
  ['', '纯文本'],
  ['javascript', 'JavaScript'],
  ['typescript', 'TypeScript'],
  ['json', 'JSON'],
  ['python', 'Python'],
  ['css', 'CSS'],
  ['xml', 'HTML / XML'],
];
export function CodeView({ node, updateAttributes }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const language = String(node.attrs.language ?? '');
  useEffect(() => setCopied(false), [node.textContent]);
  return (
    <NodeViewWrapper className="writing-code-block" data-testid="writing-code-block">
      <div className="writing-rich-toolbar" contentEditable={false}>
        <NativeSelect
          aria-label="代码语言"
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value || null })}
        >
          {codeLanguages.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          {!codeLanguages.some(([value]) => value === language) && (
            <option value={language}>{language}</option>
          )}
        </NativeSelect>
        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            void navigator.clipboard
              .writeText(node.textContent)
              .then(() => setCopied(true))
              .catch(() => toast({ title: '复制失败', tone: 'error' }))
          }
        >
          <Copy size={12} />
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <pre>
        <NodeViewContent<'code'> as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
export function ImageView({
  node,
  updateAttributes,
  resolveImage,
}: NodeViewProps & { resolveImage(source: string): string }) {
  const [width, setWidth] = useState(0),
    [align, setAlign] = useState('center');
  const image = useRef<HTMLImageElement>(null),
    drag = useRef<{ x: number; width: number } | null>(null);
  return (
    <NodeViewWrapper
      className="writing-image-block"
      data-align={align}
      data-testid="writing-image-block"
      contentEditable={false}
    >
      <div className="writing-image-frame" style={width ? { width } : undefined}>
        <img ref={image} src={resolveImage(String(node.attrs.src))} alt={node.attrs.alt ?? ''} />
        <IconButton
          variant="secondary"
          size="icon-xs"
          className="writing-image-resize"
          aria-label="调整图片宽度"
          role="slider"
          aria-valuemin={80}
          aria-valuemax={1200}
          aria-valuenow={width || Math.round(image.current?.width ?? 680)}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, width: image.current?.width ?? 680 };
          }}
          onPointerMove={(e) => {
            if (drag.current)
              setWidth(
                Math.min(1200, Math.max(80, drag.current.width + e.clientX - drag.current.x)),
              );
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
              e.preventDefault();
              setWidth(
                Math.min(
                  1200,
                  Math.max(
                    80,
                    (width || image.current?.width || 680) + (e.key === 'ArrowRight' ? 10 : -10),
                  ),
                ),
              );
            }
          }}
        >
          ↔
        </IconButton>
      </div>
      <div className="writing-rich-toolbar">
        <Input
          appearance="ghost"
          aria-label="图片图注"
          placeholder="添加图注…"
          value={node.attrs.alt ?? ''}
          onChange={(e) => updateAttributes({ alt: e.target.value })}
        />
        <NativeSelect
          aria-label="图片对齐"
          value={align}
          onChange={(e) => setAlign(e.target.value)}
        >
          <option value="left">左对齐</option>
          <option value="center">居中</option>
          <option value="right">右对齐</option>
        </NativeSelect>
      </div>
    </NodeViewWrapper>
  );
}
