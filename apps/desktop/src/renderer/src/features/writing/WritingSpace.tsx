import { Tabs, TabsList, TabsTrigger } from '@jarvis/ui/components/Tabs';
import { useConfirm } from '@jarvis/ui/components/AlertDialog';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { FileTreeRow } from './tree/FileTreeRow';
import { FilePreview } from './viewers/FilePreview';
import { isWritingText } from '../../../../shared/writing';
import { WritingAgentSidebar } from './WritingAgentSidebar';
import { useWritingHost } from './use-writing-host';
import { AssistantPanel, AssistantEmpty } from '@jarvis/ui/components/AssistantPanel';
import { SidebarItem } from '@jarvis/ui/components/SidebarItem';
import { Sparkles } from '@jarvis/ui/icons';
import { createPortal } from 'react-dom';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Alert } from '@jarvis/ui/components/Alert';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@jarvis/ui/components/Dialog';
import { Field, FieldLabel } from '@jarvis/ui/components/Field';
import { Input } from '@jarvis/ui/components/Input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
} from '@jarvis/ui/components/DropdownMenu';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ChevronDown,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Search,
  X,
} from '@jarvis/ui/icons';
import type { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { WritingEntry } from '../../../../shared/writing';
import { MarkdownEditor } from './MarkdownEditor';
import { unwrap, useWriting } from './useWriting';

function ResizeHandle({
  side,
  width,
  onChange,
}: {
  side: 'left' | 'right';
  width: number;
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const minimum = side === 'left' ? 230 : 240;
  const maximum = side === 'left' ? 340 : 400;
  const clamp = (n: number) => Math.max(minimum, Math.min(maximum, Math.round(n)));
  return (
    <div
      className={`writing-resizer ${side}`}
      role="separator"
      aria-label={`调整${side === 'left' ? '左' : '右'}侧栏宽度`}
      aria-orientation="vertical"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, width };
      }}
      onPointerMove={(e) => {
        if (drag.current)
          onChange(
            clamp(drag.current.width + (e.clientX - drag.current.x) * (side === 'left' ? 1 : -1)),
          );
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onDoubleClick={() => onChange(side === 'left' ? 260 : 280)}
      onKeyDown={(e) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        onChange(
          e.key === 'Home'
            ? minimum
            : e.key === 'End'
              ? maximum
              : clamp(width + (e.key === 'ArrowRight' ? 10 : -10) * (side === 'left' ? 1 : -1)),
        );
      }}
    />
  );
}

export function WritingSpace({
  writing,
  shell,
}: {
  writing: ReturnType<typeof useWriting>;
  shell: {
    active: boolean;
    leftHost: HTMLElement | null;
    rightHost: HTMLElement | null;
    rightOpen: boolean;
    rightWidth: number;
    onWidth: (width: number) => void;
    onClose: () => void;
    configure: () => void;
    onOpen: (path: string, newTab: boolean) => void;
  };
}) {
  const confirm = useConfirm();
  const [leftView, setLeftView] = useState('files');
  const [moving, setMoving] = useState<WritingEntry | null>(null);
  const [moveTargets, setMoveTargets] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState('');
  const lastMarkdown = useRef('');
  const [selectedParagraphs, setSelectedParagraphs] = useState(0);
  const [source, setSource] = useState(false);
  const [folderMenu, setFolderMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WritingEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [creation, setCreation] = useState<'file' | 'directory' | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const creationTrigger = useRef<HTMLElement | null>(null);
  const creationInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const view = useRef<EditorView | null>(null);
  const editorCache = useRef(new Map<string, { state: EditorState; scroll: number }>());
  useEffect(() => {
    const ids = new Set(writing.documents.map((d) => d.id));
    for (const id of editorCache.current.keys()) if (!ids.has(id)) editorCache.current.delete(id);
  }, [writing.documents]);
  const writingHost = useWritingHost(writing, view, editorCache);
  const active = writing.documents.find((d) => d.id === writing.activeId);
  const preview = !!active && !isWritingText(active.path);
  useEffect(() => {
    if (active?.fileType === 'markdown' || (active && !active.fileType))
      lastMarkdown.current = active.id;
  }, [active]);
  useEffect(() => {
    try {
      setLeftView(
        localStorage.getItem('jarvis:writing-left-view:' + writing.root?.id) === 'graph'
          ? 'graph'
          : 'files',
      );
    } catch {
      setLeftView('files');
    }
  }, [writing.root?.id]);
  useEffect(() => {
    if (preview && shell.rightOpen) shell.onClose();
  }, [preview, shell.rightOpen, shell.onClose]);
  async function fileAction(
    entry: WritingEntry,
    action: 'duplicate' | 'trash' | 'reveal' | 'move' | 'new-file' | 'new-directory',
  ) {
    const rootId = writing.root?.id,
      api = window.desktop?.writing;
    if (!rootId || !api) return;
    try {
      if (action === 'new-file' || action === 'new-directory') {
        writing.setSelectedDirectory(entry.path);
        setName('');
        setCreation(action === 'new-file' ? 'file' : 'directory');
        return;
      }
      if (action === 'move') {
        const targets = [''];
        for (let i = 0; i < targets.length && i < 2000; i++) {
          for (const dir of unwrap(await api.listDirectory({ rootId, path: targets[i]! })))
            if (dir.kind === 'directory') targets.push(dir.path);
        }
        setMoveTargets(targets);
        setMoveTarget('');
        setMoving(entry);
        return;
      }
      if (action === 'trash') {
        if (!(await confirm({ title: '移到废纸篓？', message: `将“${entry.name}”移到废纸篓。` })))
          return;
        const doc = writing.documents.find((d) => d.rootId === rootId && d.path === entry.path);
        if (doc && !(await writing.closeDocument(doc.id))) return;
        unwrap(await api.trash({ rootId, path: entry.path }));
      } else if (action === 'duplicate') {
        const result = unwrap(await api.duplicate({ rootId, path: entry.path }));
        await writing.openDocument(result);
        shell.onOpen(result.path, true);
      } else unwrap(await api.reveal({ rootId, path: entry.path }));
      await writing.refresh(entry.path.split('/').slice(0, -1).join('/'));
    } catch (error) {
      writing.setNotice(error instanceof Error ? error.message : '文件操作失败');
    }
  }
  async function moveFile(path: string, targetDir: string) {
    if (!writing.root || !window.desktop) return;
    if (!(await writing.flush())) return writing.setNotice('请先处理未保存文档');
    try {
      unwrap(await window.desktop.writing.move({ rootId: writing.root.id, path, targetDir }));
      setMoving(null);
    } catch (error) {
      writing.setNotice(error instanceof Error ? error.message : '移动失败');
    }
  }

  useEffect(() => {
    if (!searchOpen || !query.trim() || !writing.root) {
      setResults(null);
      return;
    }
    let current = true;
    setSearching(true);
    const rootId = writing.root.id;
    const timer = setTimeout(() => {
      void window.desktop?.writing
        .searchFiles({ rootId, query: query.trim() })
        .then(unwrap)
        .then((entries) => {
          if (current) setResults(entries);
        })
        .catch((error: unknown) => {
          if (current) writing.setNotice(error instanceof Error ? error.message : '搜索失败');
        })
        .finally(() => {
          if (current) setSearching(false);
        });
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, searchOpen, writing.root, writing.setNotice]);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shell.active || e.isComposing) return;
      if (e.key === 'Escape') {
        setFolderMenu(false);
        setMoreMenu(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && writing.root && !creation) {
        e.preventDefault();
        setCreation('file');
        setName('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [writing.root, shell.active, creation]);
  function toggleSearch() {
    setSearchOpen((open) => !open);
    setQuery('');
    setResults(null);
    if (searchOpen) requestAnimationFrame(() => searchToggle.current?.focus());
  }
  async function submitCreation(e: FormEvent) {
    e.preventDefault();
    if (!creation || creating) return;
    setCreating(true);
    try {
      if (await writing.create(name, creation)) setCreation(null);
    } finally {
      setCreating(false);
    }
  }
  function fileTree(path: string, depth = 0): React.ReactNode {
    return (writing.directories[path] ?? []).map((entry) => (
      <div key={entry.path}>
        <FileTreeRow
          entry={entry}
          depth={depth}
          expanded={writing.expanded.has(entry.path)}
          selected={active?.rootId === writing.root?.id && active?.path === entry.path}
          empty={writing.directories[entry.path]?.length === 0}
          onToggle={() => void writing.toggleDirectory(entry.path)}
          onOpen={(newTab) =>
            void writing.openDocument(entry).then(() => shell.onOpen(entry.path, newTab))
          }
          onRename={async (name) => {
            if (!writing.root || !window.desktop || !(await writing.flush())) return;
            try {
              unwrap(
                await window.desktop.writing.rename({
                  rootId: writing.root.id,
                  path: entry.path,
                  name,
                }),
              );
            } catch (error) {
              writing.setNotice(error instanceof Error ? error.message : '改名失败');
            }
          }}
          onAction={(action) => void fileAction(entry, action)}
          onDrop={(path) => void moveFile(path, entry.path)}
        />
        {entry.kind === 'directory' &&
          writing.expanded.has(entry.path) &&
          fileTree(entry.path, depth + 1)}
      </div>
    ));
  }
  return (
    <div className="writing-shell" data-platform={window.desktop?.platform}>
      {shell.leftHost &&
        createPortal(
          <aside className="writing-left" aria-label="写作文件目录">
            <div className="writing-folder-area">
              <DropdownMenu open={folderMenu} onOpenChange={setFolderMenu}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="lg"
                    className="writing-folder-picker"
                    disabled={writing.loading}
                  >
                    <Folder size={20} />
                    <strong>{writing.root?.name ?? '打开文件夹'}</strong>
                    <ChevronDown size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent aria-label="切换文件夹" align="start">
                  <DropdownMenuLabel>切换文件夹</DropdownMenuLabel>
                  {writing.roots.map((root) => (
                    <DropdownMenuItem
                      key={root.id}
                      title={root.directory}
                      onSelect={() => {
                        setQuery('');
                        void writing.switchRoot(root);
                      }}
                    >
                      <Folder />
                      <span>{root.name}</span>
                      {writing.root?.id === root.id && (
                        <DropdownMenuShortcut>当前</DropdownMenuShortcut>
                      )}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem
                    onSelect={() => {
                      void writing.chooseDirectory();
                    }}
                  >
                    <FolderPlus />
                    打开其他文件夹…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {writing.root && (
              <>
                <div className="writing-file-tools">
                  <div>
                    <IconButton
                      variant="ghost"
                      size="icon-sm"
                      ref={searchToggle}
                      aria-label="搜索文件"
                      aria-expanded={searchOpen}
                      onClick={toggleSearch}
                    >
                      <Search size={18} />
                    </IconButton>

                    <IconButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label="新建文件"
                      onClick={() => {
                        setCreation('file');
                        setName('');
                      }}
                    >
                      <FilePlus size={18} />
                    </IconButton>
                    <IconButton
                      variant="ghost"
                      size="icon-sm"
                      aria-label="新建文件夹"
                      onClick={() => {
                        setCreation('directory');
                        setName('');
                      }}
                    >
                      <FolderPlus size={18} />
                    </IconButton>
                    <DropdownMenu open={moreMenu} onOpenChange={setMoreMenu}>
                      <DropdownMenuTrigger asChild>
                        <IconButton variant="ghost" size="icon-sm" aria-label="更多文件操作">
                          <MoreHorizontal size={18} />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent aria-label="更多文件操作" align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            void writing.refresh();
                            for (const path of writing.expanded) void writing.refresh(path);
                          }}
                        >
                          刷新文件列表
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {searchOpen && (
                  <div className="writing-search">
                    <Search size={16} />
                    <Input
                      appearance="ghost"
                      ref={searchInput}
                      aria-label="搜索文件名"
                      placeholder="搜索文件…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') toggleSearch();
                      }}
                    />
                  </div>
                )}
                <Tabs
                  value={leftView}
                  onValueChange={(value) => {
                    setLeftView(value);
                    try {
                      localStorage.setItem('jarvis:writing-left-view:' + writing.root?.id, value);
                    } catch {
                      writing.setNotice('无法保存左栏视图偏好');
                    }
                  }}
                >
                  <TabsList aria-label="写作目录视图" className="writing-left-tabs">
                    <TabsTrigger value="files" className="flex-1">
                      文件
                    </TabsTrigger>
                    <TabsTrigger value="graph" className="flex-1">
                      星图
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                {leftView === 'graph' ? (
                  <p className="p-4 text-fg-secondary">星图将在后续版本提供</p>
                ) : (
                  <nav className="writing-tree" aria-label="文件列表">
                    {query.trim() && searchOpen ? (
                      <>
                        {searching && <p role="status">正在搜索…</p>}
                        {results?.map((entry) => (
                          <SidebarItem
                            icon={<FileText />}
                            className="writing-file"
                            key={entry.path}
                            title={entry.path}
                            onClick={(event) =>
                              void writing
                                .openDocument(entry)
                                .then(() =>
                                  shell.onOpen(entry.path, event.metaKey || event.ctrlKey),
                                )
                            }
                            onAuxClick={(event) => {
                              if (event.button === 1) {
                                event.preventDefault();
                                void writing
                                  .openDocument(entry)
                                  .then(() => shell.onOpen(entry.path, true));
                              }
                            }}
                          >
                            {entry.path}
                          </SidebarItem>
                        ))}
                        {results?.length === 0 && <p>没有匹配的文件</p>}
                      </>
                    ) : (
                      fileTree('')
                    )}
                    {!query && writing.directories['']?.length === 0 && (
                      <p>文件夹为空，新建一篇文档吧。</p>
                    )}
                  </nav>
                )}
              </>
            )}
            <footer className="writing-root-path" title={writing.root?.directory}>
              {writing.root?.directory ?? '尚未打开文件夹'}
            </footer>
          </aside>,
          shell.leftHost,
        )}
      <main data-testid="writing-main" className="writing-main">
        <div className="writing-document-tools">
          <span>
            {writing.root
              ? `${writing.roots.find((r) => r.id === active?.rootId)?.name ?? writing.root.name}${active ? ' / ' + active.path.replaceAll('/', ' / ') : ''}`
              : '本地 Markdown 工作区'}
          </span>
          {active && !preview && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSource((s) => !s)}
              title="切换 Markdown 源码与实时预览"
            >
              {source || active.fileType === 'text' ? '源码模式' : '实时预览'}
              <ChevronDown size={12} />
            </Button>
          )}
        </div>
        {writing.notice && (
          <Alert tone="error" onDismiss={() => writing.setNotice('')}>
            {writing.notice}
          </Alert>
        )}
        {active?.error && (
          <Alert
            tone="error"
            action={
              <div className="flex flex-wrap gap-2">
                {active.status !== 'conflict' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void writing.save(active.id)}
                  >
                    重试保存
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void writing.reload(active.id)}
                >
                  重新读取
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void writing.saveCopy(active.id)}
                >
                  另存副本
                </Button>
              </div>
            }
          >
            {active.error}
          </Alert>
        )}
        {active && preview ? (
          <FilePreview
            key={active.id}
            document={active}
            onError={writing.setNotice}
            onInsert={
              writing.documents.some(
                (d) =>
                  d.id === lastMarkdown.current &&
                  d.rootId === active.rootId &&
                  !['conflict', 'error'].includes(d.status),
              )
                ? () => {
                    const target = writing.documents.find((d) => d.id === lastMarkdown.current);
                    if (!target) return;
                    const from = target.path.split('/').slice(0, -1),
                      to = active.path.split('/');
                    while (from.length && to.length && from[0] === to[0]) {
                      from.shift();
                      to.shift();
                    }
                    const relative = [...from.map(() => '..'), ...to]
                      .map(encodeURIComponent)
                      .join('/');
                    writing.change(target.id, target.content + `\n\n![](${relative})\n`, true);
                    writing.setNotice('已插入到 ' + target.path + '（未保存）');
                  }
                : undefined
            }
          />
        ) : active ? (
          <MarkdownEditor
            document={active}
            onChange={writing.change}
            onPosition={() => {
              const editor = view.current;
              const range = editor?.state.selection.main;
              const selected =
                editor && range && !range.empty ? editor.state.sliceDoc(range.from, range.to) : '';
              setSelectedParagraphs(
                selected ? selected.split(/\n\s*\n/).filter((p) => p.trim()).length : 0,
              );
            }}
            onSave={() => void writing.save(active.id)}
            source={source || active.fileType === 'text'}
            viewRef={view}
            cache={editorCache}
          />
        ) : (
          <div className="writing-empty">
            <Folder size={36} />
            <h1>{writing.root ? '打开一篇文档，开始写作' : '从一个本地文件夹开始'}</h1>
            <p>
              {writing.root
                ? '从左侧选择 Markdown 文件，或新建一篇文档。'
                : '选择存放 Markdown 的目录，继续你已有的写作。'}
            </p>
            <Button
              loading={writing.loading}
              onClick={() => {
                if (writing.root) {
                  setCreation('file');
                  setName('');
                } else void writing.chooseDirectory();
              }}
            >
              {writing.root ? '新建文档' : '打开本地文件夹'}
            </Button>
            <small>{writing.root ? '⌘ / Ctrl + N 新建文档' : '直接读写本地 .md 文件'}</small>
          </div>
        )}
        <footer className="writing-status" role="status">
          <span>
            {active
              ? {
                  saved: '已保存到本地',
                  dirty: '尚未保存',
                  saving: '正在保存…',
                  error: '保存或读取失败',
                  conflict: '外部修改冲突',
                }[active.status]
              : writing.root
                ? '请选择文档'
                : '尚未打开文件夹'}
          </span>
          <span>已选 {selectedParagraphs} 段</span>
          <span>
            {active && !preview
              ? `${Array.from(active.content.replace(/\s/g, '')).length} 字 · ${active.fileType === 'text' ? '文本' : 'Markdown'} · UTF-8`
              : active?.path.split('.').at(-1)?.toUpperCase()}
          </span>
        </footer>
      </main>
      {shell.rightHost &&
        shell.active &&
        shell.rightOpen &&
        createPortal(
          <div className="writing-assistant-host" style={{ width: shell.rightWidth }}>
            {active && !preview ? (
              <WritingAgentSidebar
                key={active.id}
                document={active}
                host={writingHost}
                selectedParagraphs={selectedParagraphs}
                configure={shell.configure}
                close={shell.onClose}
              />
            ) : (
              <AssistantPanel
                aria-label="写作助手"
                title="写作助手"
                className="writing-assistant"
                style={{ width: shell.rightWidth }}
                actions={
                  <IconButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label="关闭写作助手"
                    onClick={shell.onClose}
                  >
                    <X size={16} />
                  </IconButton>
                }
              >
                <AssistantEmpty title="写作助手" icon={<Sparkles size={24} />}>
                  读取当前文档，帮你改写、续写、总结；每次修改都可以撤销。
                </AssistantEmpty>
                <ResizeHandle side="right" width={shell.rightWidth} onChange={shell.onWidth} />
              </AssistantPanel>
            )}
            {active && (
              <ResizeHandle side="right" width={shell.rightWidth} onChange={shell.onWidth} />
            )}
          </div>,
          shell.rightHost,
        )}
      <Dialog open={!!moving} onOpenChange={(open) => !open && setMoving(null)}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>移动到文件夹</DialogTitle>
            <DialogDescription>{moving?.name}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <NativeSelect
              aria-label="目标文件夹"
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
            >
              {moveTargets.map((path) => (
                <option key={path} value={path}>
                  {path || '根目录'}
                </option>
              ))}
            </NativeSelect>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMoving(null)}>
              取消
            </Button>
            <Button onClick={() => moving && void moveFile(moving.path, moveTarget)}>移动</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!creation} onOpenChange={(open) => !open && !creating && setCreation(null)}>
        <DialogContent
          size="sm"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            creationTrigger.current =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            creationInput.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (creationTrigger.current?.isConnected) creationTrigger.current.focus();
          }}
          onEscapeKeyDown={(e) => creating && e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <form onSubmit={(e) => void submitCreation(e)}>
            <DialogHeader showClose={!creating}>
              <DialogTitle>{creation === 'directory' ? '新建文件夹' : '新建文档'}</DialogTitle>
              <DialogDescription className="break-words">
                位置：{writing.root?.name}
                {writing.selectedDirectory ? ' / ' + writing.selectedDirectory : ''}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Field
                controlId="writing-new-name"
                disabled={creating}
                description={
                  creation === 'file'
                    ? '自动添加 .md 后缀，同名文件不会覆盖。'
                    : '在当前目录中创建文件夹。'
                }
              >
                <FieldLabel>{creation === 'directory' ? '文件夹名称' : '文档名称'}</FieldLabel>
                <Input
                  ref={creationInput}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  required
                  autoComplete="off"
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" disabled={creating} onClick={() => setCreation(null)}>
                取消
              </Button>
              <Button type="submit" loading={creating} disabled={!name.trim()}>
                创建
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
