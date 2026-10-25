import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Tabs, TabsList, TabsTrigger } from '@jarvis/ui/components/Tabs';
import { Workflow, Maximize } from '@jarvis/ui/icons';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Textarea } from '@jarvis/ui/components/Textarea';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { Alert } from '@jarvis/ui/components/Alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@jarvis/ui/components/Dialog';
import { renderMermaid } from './mermaid-renderer';
const mermaidTemplates = {
  flow: 'flowchart LR\n  A[开始] --> B[处理]\n  B --> C[完成]',
  sequence: 'sequenceDiagram\n  用户->>系统: 请求\n  系统-->>用户: 返回结果',
  state: 'stateDiagram-v2\n  [*] --> 等待\n  等待 --> 进行中\n  进行中 --> 完成\n  完成 --> [*]',
};
function DiagramPreview({ code, onError }: { code: string; onError(message: string): void }) {
  const host = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.dataset.theme === 'dark'),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);
  const error = useRef(onError);
  error.current = onError;
  useEffect(() => {
    let alive = true;
    void renderMermaid(code, dark)
      .then((svg) => {
        if (alive && host.current) {
          host.current.innerHTML = svg;
          error.current('');
        }
      })
      .catch((reason: unknown) => {
        if (alive) {
          host.current?.replaceChildren();
          error.current(
            reason instanceof Error ? reason.message.slice(0, 1200) : '图表语法无法解析',
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [code, dark]);
  return (
    <div ref={host} role="img" aria-label="Mermaid 图表" className="writing-mermaid-preview" />
  );
}
export function MermaidView({ node, updateAttributes }: NodeViewProps) {
  const [source, setSource] = useState(false),
    [error, setError] = useState(''),
    [wide, setWide] = useState(false),
    [expanded, setExpanded] = useState(false);
  const code = String(node.attrs.code);
  const errorLine = Number(/(?:line|行)\s*(\d+)/i.exec(error)?.[1] ?? 0);
  return (
    <NodeViewWrapper
      className={`writing-rich-block ${wide ? 'is-wide' : ''}`}
      contentEditable={false}
      data-testid="writing-mermaid"
    >
      <div className="writing-rich-toolbar">
        <Workflow size={14} />
        <span>Mermaid</span>
        <NativeSelect
          aria-label="图表模板"
          defaultValue=""
          onChange={(e) => {
            const value = mermaidTemplates[e.target.value as keyof typeof mermaidTemplates];
            if (value) {
              updateAttributes({ code: value });
              setSource(false);
              setError('');
            }
          }}
        >
          <option value="" disabled>
            插入模板
          </option>
          <option value="flow">流程图</option>
          <option value="sequence">时序图</option>
          <option value="state">状态图</option>
        </NativeSelect>
        <Tabs
          value={source ? 'source' : 'preview'}
          onValueChange={(value) => {
            setSource(value === 'source');
            setError('');
          }}
        >
          <TabsList aria-label="图表视图">
            <TabsTrigger value="preview" aria-label="预览图表">
              预览
            </TabsTrigger>
            <TabsTrigger value="source" aria-label="编辑源码">
              源码
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="ghost" size="xs" aria-pressed={wide} onClick={() => setWide(!wide)}>
          {wide ? '正文宽度' : '全宽'}
        </Button>
        <IconButton
          variant="ghost"
          size="icon-xs"
          aria-label="展开图表"
          onClick={() => setExpanded(true)}
        >
          <Maximize size={14} />
        </IconButton>
      </div>
      {!source && <DiagramPreview code={code} onError={setError} />}
      {error && <Alert tone="error">{error}</Alert>}
      {errorLine > 0 && (
        <pre className="writing-mermaid-error-line">
          第 {errorLine} 行：{code.split(/\r?\n/)[errorLine - 1]}
        </pre>
      )}
      {(source || error) && (
        <Textarea
          aria-label="Mermaid 源码"
          className={error ? 'writing-code-source writing-code-error' : 'writing-code-source'}
          value={code}
          rows={6}
          onChange={(e) => updateAttributes({ code: e.target.value })}
        />
      )}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="writing-diagram-dialog">
          <DialogHeader>
            <DialogTitle>Mermaid 图表</DialogTitle>
          </DialogHeader>
          {expanded && <DiagramPreview code={code} onError={setError} />}
        </DialogContent>
      </Dialog>
    </NodeViewWrapper>
  );
}
