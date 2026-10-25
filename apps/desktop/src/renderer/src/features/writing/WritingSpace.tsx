import { WritingAgentSidebar } from './WritingAgentSidebar';
import { useWritingHost } from './use-writing-host';
import { AssistantPanel, AssistantEmpty } from '@jarvis/ui/components/AssistantPanel';
import { SidebarItem } from '@jarvis/ui/components/SidebarItem';
import { Sparkles } from '@jarvis/ui/icons';
import { createPortal } from 'react-dom';
import { Button } from '@jarvis/ui/components/Button';
import { Alert } from '@jarvis/ui/components/Alert';
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
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Search,
  X,
} from '@jarvis/ui/icons';
import type { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { WritingEntry } from '../../../../shared/writing';
import { IconButton } from '../../components/IconButton';
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
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const view = useRef<EditorView | null>(null);
  const editorCache = useRef(new Map<string, { state: EditorState; scroll: number }>());
  useEffect(() => {
    const ids = new Set(writing.documents.map((d) => d.id));
    for (const id of editorCache.current.keys()) if (!ids.has(id)) editorCache.current.delete(id);
  }, [writing.documents]);
  const writingHost = useWritingHost(writing, view, editorCache);
  const active = writing.documents.find(
    (d) => d.id === writing.activeId && d.rootId === writing.root?.id,
  );
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
    if (creation) dialog.current?.showModal();
    else dialog.current?.close();
  }, [creation]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shell.active || e.isComposing) return;
      if (e.key === 'Escape') {
        setFolderMenu(false);
        setMoreMenu(false);
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === 'n' &&
        writing.root &&
        !dialog.current?.open
      ) {
        e.preventDefault();
        setCreation('file');
        setName('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [writing.root, shell.active]);
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
        <SidebarItem
          depth={depth}
          icon={
            entry.kind === 'directory' ? (
              writing.expanded.has(entry.path) ? (
                <FolderOpen size={16} />
              ) : (
                <Folder size={16} />
              )
            ) : (
              <FileText size={16} />
            )
          }
          selected={entry.kind === 'file' && active?.path === entry.path}
          aria-current={entry.kind === 'file' && active?.path === entry.path ? 'page' : undefined}
          className={`writing-file ${entry.kind === 'file' && active?.path === entry.path ? 'selected' : ''} ${entry.kind === 'directory' && writing.selectedDirectory === entry.path ? 'current-folder' : ''}`}
          title={entry.path}
          aria-expanded={entry.kind === 'directory' ? writing.expanded.has(entry.path) : undefined}
          onAuxClick={(event) => {
            if (event.button === 1 && entry.kind === 'file') {
              event.preventDefault();
              void writing.openDocument(entry).then(() => shell.onOpen(entry.path, true));
            }
          }}
          onClick={(event) => {
            if (entry.kind === 'directory') void writing.toggleDirectory(entry.path);
            else
              void writing
                .openDocument(entry)
                .then(() => shell.onOpen(entry.path, event.metaKey || event.ctrlKey));
          }}
        >
          <span>{entry.name}</span>
        </SidebarItem>
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
                  <button className="writing-folder-picker" disabled={writing.loading}>
                    <Folder size={20} />
                    <strong>{writing.root?.name ?? '打开文件夹'}</strong>
                    <ChevronDown size={14} />
                  </button>
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
                  <span>文件</span>
                  <div>
                    <IconButton
                      label="新建文件"
                      onClick={() => {
                        setCreation('file');
                        setName('');
                      }}
                    >
                      <FilePlus size={18} />
                    </IconButton>
                    <IconButton
                      label="新建文件夹"
                      onClick={() => {
                        setCreation('directory');
                        setName('');
                      }}
                    >
                      <FolderPlus size={18} />
                    </IconButton>
                    <DropdownMenu open={moreMenu} onOpenChange={setMoreMenu}>
                      <DropdownMenuTrigger asChild>
                        <IconButton label="更多文件操作">
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
                    <input
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
                <nav className="writing-tree" aria-label="文件列表">
                  {query.trim() && searchOpen ? (
                    <>
                      {searching && <p role="status">正在搜索…</p>}
                      {results?.map((entry) => (
                        <button
                          className="writing-file"
                          key={entry.path}
                          title={entry.path}
                          onClick={(event) =>
                            void writing
                              .openDocument(entry)
                              .then(() => shell.onOpen(entry.path, event.metaKey || event.ctrlKey))
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
                          <FileText size={16} />
                          <span>{entry.path}</span>
                        </button>
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
              ? `${writing.root.name}${active ? ' / ' + active.path.replaceAll('/', ' / ') : ''}`
              : '本地 Markdown 工作区'}
          </span>
          {active && (
            <button onClick={() => setSource((s) => !s)} title="切换 Markdown 源码与实时预览">
              {source ? '源码模式' : '实时预览'}
              <ChevronDown size={12} />
            </button>
          )}
          {writing.root && (
            <IconButton
              ref={searchToggle}
              label="搜索文件"
              aria-expanded={searchOpen}
              onClick={toggleSearch}
            >
              <Search size={18} />
            </IconButton>
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
        {active ? (
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
            source={source}
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
            <button
              className="primary-button"
              disabled={writing.loading}
              onClick={() => {
                if (writing.root) {
                  setCreation('file');
                  setName('');
                } else void writing.chooseDirectory();
              }}
            >
              {writing.root ? '新建文档' : writing.loading ? '正在打开…' : '打开本地文件夹'}
            </button>
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
            {active ? `${Array.from(active.content.replace(/\s/g, '')).length} 字 · ` : ''}Markdown
            · UTF-8
          </span>
        </footer>
      </main>
      {shell.rightHost &&
        shell.active &&
        shell.rightOpen &&
        createPortal(
          <div className="writing-assistant-host" style={{ width: shell.rightWidth }}>
            {active ? (
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
                  <IconButton label="关闭写作助手" onClick={shell.onClose}>
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
      <dialog ref={dialog} className="writing-create-dialog" onCancel={() => setCreation(null)}>
        <form onSubmit={(e) => void submitCreation(e)}>
          <h2>{creation === 'directory' ? '新建文件夹' : '新建文档'}</h2>
          <p>
            位置：{writing.root?.name}
            {writing.selectedDirectory ? ' / ' + writing.selectedDirectory : ''}
          </p>
          <label htmlFor="writing-new-name">
            {creation === 'directory' ? '文件夹名称' : '文档名称'}
          </label>
          <input
            id="writing-new-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
            autoComplete="off"
          />
          <small>
            {creation === 'file'
              ? '自动添加 .md 后缀，同名文件不会覆盖。'
              : '在当前目录中创建文件夹。'}
          </small>
          <div>
            <button type="button" disabled={creating} onClick={() => setCreation(null)}>
              取消
            </button>
            <button className="primary-button" disabled={creating || !name.trim()}>
              {creating ? '正在创建…' : '创建'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
