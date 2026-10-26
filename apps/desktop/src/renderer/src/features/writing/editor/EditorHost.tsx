import { useEffect, useMemo, useRef, useState, type ReactNode, type MutableRefObject } from 'react';
import type { EditorView } from '@codemirror/view';
import { createPortal } from 'react-dom';
import { Search } from '@jarvis/ui/icons';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Input } from '@jarvis/ui/components/Input';
import { Tabs, TabsList, TabsTrigger } from '@jarvis/ui/components/Tabs';
import { Popover, PopoverTrigger, PopoverContent } from '@jarvis/ui/components/Popover';
import { toast } from '@jarvis/ui/components/Toast';
import { MarkdownEditor } from '../MarkdownEditor';
import { BlockEditor } from './BlockEditor';
import { clearViewCache, type BufferView, type ViewCache } from './buffer-view';
import { documentIcon, setDocumentIcon } from './frontmatter';
import { parse, blockRanges } from './markdown/roundtrip';
import type { DocumentSession } from '../useWriting';

export function EditorHost({
  document,
  toolbarHost,
  bufferRef,
  cache,
  onChange,
  onPosition,
  onSave,
  onRename,
  onOpenLink,
  onAsk,
  footer,
}: {
  footer?: ReactNode;
  document: DocumentSession;
  toolbarHost: HTMLElement | null;
  bufferRef: MutableRefObject<BufferView | null>;
  cache: ViewCache;
  onChange(id: string, content: string, manualSave?: boolean): void;
  onPosition(): void;
  onSave(): void;
  onRename(name: string): Promise<void>;
  onOpenLink(target: string, newTab: boolean): void;
  onAsk(prompt?: string, range?: { from: number; to: number }): void;
}) {
  const text = document.fileType === 'text';
  const storageKey = 'jarvis:writing-view:' + document.rootId + ':' + document.path;
  const [source, setSource] = useState(() => {
    try {
      return text || localStorage.getItem(storageKey) === 'source';
    } catch {
      return text;
    }
  });
  const view = useRef<EditorView | null>(null),
    sourceCache = useRef(cache.source);
  const fileName = document.path.split('/').at(-1) ?? document.path;
  const extension = /\.[^.]+$/.exec(fileName)?.[0] ?? '.md';
  const [title, setTitle] = useState(fileName.slice(0, -extension.length));
  const [search, setSearch] = useState('');
  const [renameError, setRenameError] = useState('');
  const pending = useRef(false);
  const icon = documentIcon(document.content);
  const outline = useMemo(() => {
    if (text) return [];
    const { doc } = parse(document.content),
      ranges = blockRanges(doc);
    const result: { title: string; level: number; from: number }[] = [];
    doc.forEach((node, _pos, index) => {
      if (node.type.name === 'heading' && node.attrs.level <= 3)
        result.push({
          title: node.textContent,
          level: node.attrs.level,
          from: ranges[index]!.from,
        });
    });
    return result;
  }, [document.content, text]);
  const [currentHeading, setCurrentHeading] = useState(0),
    [outlineOpen, setOutlineOpen] = useState(false);
  const scrollHost = useRef<HTMLDivElement>(null);
  function switchView(next: boolean) {
    if (next === source) return;
    const current = bufferRef.current;
    if (current) {
      cache.selections.set(document.id, current.getSelection());
      current.finishAgent();
    }
    clearViewCache(cache, document.id);
    setSource(next);
    try {
      localStorage.setItem(storageKey, next ? 'source' : 'blocks');
    } catch {
      toast({ title: '无法保存视图偏好', tone: 'warning' });
    }
  }
  async function rename() {
    if (pending.current || title === fileName.slice(0, -extension.length)) return;
    pending.current = true;
    try {
      await onRename(title + extension);
      setRenameError('');
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : '改名失败');
      setTitle(fileName.slice(0, -extension.length));
    } finally {
      pending.current = false;
    }
  }
  useEffect(() => {
    const current = bufferRef.current;
    if (current && cache.selections.has(document.id))
      current.setSelection(cache.selections.get(document.id)!);
  }, [source, bufferRef, cache, document.id]);
  return (
    <div
      className={`writing-editor-host ${source ? 'source-mode' : 'blocks-mode'}`}
      data-writing-root={document.rootId}
    >
      {toolbarHost &&
        createPortal(
          <div className="writing-view-toolbar">
            <span>
              {document.status === 'saved'
                ? '已保存'
                : document.status === 'saving'
                  ? '正在保存…'
                  : document.status === 'conflict'
                    ? '外部已修改'
                    : '未保存'}
            </span>
            {!text && (
              <Tabs
                value={source ? 'source' : 'blocks'}
                onValueChange={(value) => switchView(value === 'source')}
              >
                <TabsList aria-label="编辑视图">
                  <TabsTrigger value="blocks">块视图</TabsTrigger>
                  <TabsTrigger value="source">源码</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <IconButton variant="ghost" size="icon-sm" aria-label="搜索文档">
                  <Search />
                </IconButton>
              </PopoverTrigger>
              <PopoverContent>
                <Input
                  aria-label="查找文档内容"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && search) {
                      const start = bufferRef.current?.getSelection().to ?? 0;
                      const next = document.content.indexOf(search, start),
                        from = next < 0 ? document.content.indexOf(search) : next;
                      if (from >= 0) {
                        bufferRef.current?.scrollTo(from);
                        bufferRef.current?.setSelection({ from, to: from + search.length });
                        bufferRef.current?.focus();
                      }
                    }
                  }}
                  placeholder="输入文字，回车查找"
                />
              </PopoverContent>
            </Popover>
          </div>,
          toolbarHost,
        )}

      <div
        className="writing-document-scroll"
        ref={scrollHost}
        onScroll={() => {
          const offsets = [
            ...(scrollHost.current?.querySelectorAll<HTMLElement>(
              '.writing-block-content h1, .writing-block-content h2, .writing-block-content h3',
            ) ?? []),
          ];
          let active = 0;
          offsets.forEach((node, index) => {
            if (
              node.getBoundingClientRect().top <
              (scrollHost.current?.getBoundingClientRect().top ?? 0) + 120
            )
              active = index;
          });
          setCurrentHeading(active);
        }}
      >
        {!text && (
          <header className="writing-document-header">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={icon ? 'writing-document-icon' : 'writing-add-icon'}
                  aria-label="更换文档图标"
                >
                  {icon || '添加图标'}
                </Button>
              </PopoverTrigger>
              <PopoverContent aria-label="文档图标">
                <div className="flex gap-1">
                  {['📝', '💡', '🧠', '📚', '🎬', '🚀'].map((emoji) => (
                    <Button
                      key={emoji}
                      variant="ghost"
                      aria-label={emoji}
                      onClick={() => {
                        try {
                          onChange(document.id, setDocumentIcon(document.content, emoji));
                        } catch (e) {
                          toast({
                            title: e instanceof Error ? e.message : '图标保存失败',
                            tone: 'error',
                          });
                        }
                      }}
                    >
                      {emoji}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Input
              className="writing-document-title"
              appearance="ghost"
              aria-label="文档标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void rename()}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void rename();
                }
                if (e.key === 'Escape') setTitle(fileName.slice(0, -extension.length));
              }}
            />
            {renameError && (
              <p role="alert" className="text-danger">
                {renameError}，已恢复原名
              </p>
            )}
            <small>
              {document.path}
              {document.mtime ? ` · 修改于 ${new Date(document.mtime).toLocaleString()}` : ''} ·{' '}
              {Array.from(document.content.replace(/\s/g, '')).length} 字
            </small>
          </header>
        )}
        {source ? (
          <MarkdownEditor
            document={document}
            onChange={onChange}
            onPosition={onPosition}
            onSave={onSave}
            source
            viewRef={view}
            cache={sourceCache}
            bufferRef={bufferRef}
            viewCache={cache}
          />
        ) : (
          <BlockEditor
            document={document}
            bufferRef={bufferRef}
            cache={cache}
            onChange={onChange}
            onPosition={onPosition}
            onSave={onSave}
            onSource={() => switchView(true)}
            onOpenLink={onOpenLink}
            onAsk={onAsk}
          />
        )}
        {footer}
      </div>
      {!!outline.length && (
        <div
          className="writing-outline-rail"
          onMouseEnter={() => setOutlineOpen(true)}
          onMouseLeave={() => setOutlineOpen(false)}
          onFocus={() => setOutlineOpen(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setOutlineOpen(false);
          }}
        >
          <nav aria-label="文档大纲" className={outlineOpen ? 'writing-outline-list' : ''}>
            {outline.map((heading, index) => (
              <Button
                key={`${heading.from}:${heading.title}`}
                variant="ghost"
                size="sm"
                aria-label={heading.title}
                aria-current={currentHeading === index ? 'location' : undefined}
                onClick={() => {
                  bufferRef.current?.scrollTo(heading.from);
                  setCurrentHeading(index);
                }}
              >
                <span
                  className="writing-outline-line"
                  style={{ width: heading.level === 1 ? 16 : heading.level === 2 ? 12 : 8 }}
                />
                {outlineOpen && heading.title}
              </Button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
