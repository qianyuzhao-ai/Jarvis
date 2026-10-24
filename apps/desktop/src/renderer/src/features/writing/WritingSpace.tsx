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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@jarvis/ui/components/Tabs';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderPlus,
  ListTree,
  MessageSquare,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  X,
} from '@jarvis/ui/icons';
import type { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { WritingEntry } from '../../../../shared/writing';
import { IconButton } from '../../components/IconButton';
import { MarkdownEditor } from './MarkdownEditor';
import { unwrap, useWriting } from './useWriting';
import type { Heading } from './markdown';

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
  onBack,
  writing,
  shell,
}: {
  onBack: () => void;
  writing: ReturnType<typeof useWriting>;
  shell: {
    active: boolean;
    leftHost: HTMLElement | null;
    rightHost: HTMLElement | null;
    rightOpen: boolean;
    onOpen: (path: string, newTab: boolean) => void;
  };
}) {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(280);
  const [rightTab, setRightTab] = useState('outline');
  const [source, setSource] = useState(false);
  const [folderMenu, setFolderMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WritingEntry[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [outline, setOutline] = useState<Heading[]>([]);
  const [position, setPosition] = useState(0);
  const [creation, setCreation] = useState<'file' | 'directory' | null>(null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const leftToggle = useRef<HTMLButtonElement>(null);
  const rightToggle = useRef<HTMLButtonElement>(null);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const view = useRef<EditorView | null>(null);
  const editorCache = useRef(new Map<string, { state: EditorState; scroll: number }>());
  const active = writing.documents.find(
    (d) => d.id === writing.activeId && d.rootId === writing.root?.id,
  );
  const tabs = writing.documents.filter((d) => d.rootId === writing.root?.id);
  const preferencesReady = useRef(false);
  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem('jarvis:writing-layout') ?? '{}');
      if (value && typeof value === 'object') {
        if ('leftOpen' in value && typeof value.leftOpen === 'boolean') setLeftOpen(value.leftOpen);
        if ('rightOpen' in value && typeof value.rightOpen === 'boolean')
          setRightOpen(value.rightOpen);
        if ('leftWidth' in value && typeof value.leftWidth === 'number')
          setLeftWidth(Math.max(230, Math.min(340, value.leftWidth)));
        if ('rightWidth' in value && typeof value.rightWidth === 'number')
          setRightWidth(Math.max(240, Math.min(400, value.rightWidth)));
        if ('rightTab' in value && value.rightTab === 'assistant') setRightTab('assistant');
      }
    } catch {
      writing.setNotice('侧栏状态无法读取，已使用默认布局');
    }
    preferencesReady.current = true;
  }, [writing.setNotice]);
  useEffect(() => {
    if (!preferencesReady.current) return;
    try {
      localStorage.setItem(
        'jarvis:writing-layout',
        JSON.stringify({ leftOpen, rightOpen, leftWidth, rightWidth, rightTab }),
      );
    } catch {
      writing.setNotice('侧栏状态无法保存');
    }
  }, [leftOpen, rightOpen, leftWidth, rightWidth, rightTab, writing.setNotice]);
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
  function toggleLeft() {
    setLeftOpen((open) => !open);
    requestAnimationFrame(() => leftToggle.current?.focus());
  }
  function toggleRight() {
    setRightOpen((open) => !open);
    requestAnimationFrame(() => rightToggle.current?.focus());
  }
  function toggleSearch() {
    setSearchOpen((open) => !open);
    setQuery('');
    setResults(null);
    if (searchOpen) requestAnimationFrame(() => searchToggle.current?.focus());
  }
  async function leave() {
    if (await writing.flush()) onBack();
    else writing.setNotice('请先重试保存或处理冲突，再返回工作台');
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
        <button
          aria-current={entry.kind === 'file' && active?.path === entry.path ? 'page' : undefined}
          className={`writing-file ${entry.kind === 'file' && active?.path === entry.path ? 'selected' : ''} ${entry.kind === 'directory' && writing.selectedDirectory === entry.path ? 'current-folder' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
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
          {entry.kind === 'directory' ? (
            <>
              {writing.expanded.has(entry.path) ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
              <Folder size={16} />
            </>
          ) : (
            <FileText size={16} />
          )}
          <span>{entry.name}</span>
        </button>
        {entry.kind === 'directory' &&
          writing.expanded.has(entry.path) &&
          fileTree(entry.path, depth + 1)}
      </div>
    ));
  }
  const currentHeading = outline.filter((h) => h.from <= position).at(-1)?.from;
  return (
    <div
      className="writing-shell"
      data-platform={window.desktop?.platform}
      style={
        {
          '--writing-left': '0px',
          '--writing-right': '0px',
        } as CSSProperties
      }
    >
      {shell.leftHost &&
        createPortal(
          <aside className="writing-left" aria-label="写作文件目录">
            <div className="writing-left-chrome window-drag" hidden>
              <IconButton
                ref={leftToggle}
                label="收起左侧栏"
                onClick={toggleLeft}
                aria-expanded={true}
              >
                <PanelLeftClose size={18} />
              </IconButton>
            </div>
            <button hidden className="writing-back" onClick={() => void leave()}>
              <ArrowLeft size={14} />
              返回工作台
            </button>
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
                      ref={searchToggle}
                      label="搜索文件"
                      aria-expanded={searchOpen}
                      onClick={toggleSearch}
                    >
                      <Search size={18} />
                    </IconButton>
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
          </aside>,
          shell.leftHost,
        )}
      <main data-testid="writing-main" className="writing-main">
        <header hidden className="writing-tabs window-drag">
          {!leftOpen && (
            <div className="writing-collapsed-controls">
              <IconButton
                ref={leftToggle}
                label="展开左侧栏"
                onClick={toggleLeft}
                aria-expanded={false}
              >
                <PanelLeftOpen size={18} />
              </IconButton>
            </div>
          )}
          <div className="writing-tab-list" role="tablist" aria-label="打开的文档">
            {tabs.map((doc) => (
              <div
                className={`writing-tab ${doc.id === writing.activeId ? 'active' : ''}`}
                key={doc.id}
              >
                <button
                  role="tab"
                  aria-selected={doc.id === writing.activeId}
                  onClick={() => writing.setActiveId(doc.id)}
                  title={doc.path}
                >
                  {doc.path.split('/').at(-1)}
                  {doc.content !== doc.savedContent && <span aria-label="未保存"> ·</span>}
                </button>
                <IconButton
                  label={`关闭 ${doc.path.split('/').at(-1)}`}
                  onClick={() => void writing.closeDocument(doc.id)}
                >
                  <X size={14} />
                </IconButton>
              </div>
            ))}
            {!tabs.length && <span className="writing-tab-placeholder">写作空间</span>}
          </div>
          <IconButton
            ref={rightToggle}
            label={rightOpen ? '收起右侧栏' : '展开右侧栏'}
            onClick={toggleRight}
            aria-expanded={rightOpen}
          >
            {rightOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </IconButton>
        </header>
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
            onOutline={setOutline}
            onPosition={setPosition}
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
          <Tabs appearance="underline" value={rightTab} onValueChange={setRightTab} asChild>
            <aside className="writing-right" aria-label="写作辅助面板">
              <TabsList className="writing-right-tabs" aria-label="辅助功能">
                <TabsTrigger value="outline" aria-label="文章大纲">
                  <ListTree />
                </TabsTrigger>
                <TabsTrigger value="assistant" aria-label="写作助手">
                  <MessageSquare />
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value={rightTab}
                className="writing-right-content"
                aria-label={rightTab === 'outline' ? '文章大纲' : '写作助手'}
              >
                <h2>{rightTab === 'outline' ? '文章大纲' : '写作助手'}</h2>
                {rightTab === 'outline' ? (
                  !active ? (
                    <p>打开文档后显示标题导航</p>
                  ) : outline.length ? (
                    <nav aria-label="文章标题">
                      {outline.map((heading) => (
                        <button
                          key={heading.from}
                          className={currentHeading === heading.from ? 'current' : ''}
                          style={{ paddingLeft: 12 + (heading.level - 1) * 12 }}
                          onClick={() => {
                            const editor = view.current;
                            if (editor) {
                              editor.dispatch({
                                selection: { anchor: heading.from },
                                effects: EditorView.scrollIntoView(heading.from, {
                                  y: 'start',
                                  yMargin: 32,
                                }),
                              });
                              editor.focus();
                            }
                          }}
                        >
                          {heading.title || '未命名标题'}
                        </button>
                      ))}
                    </nav>
                  ) : (
                    <p>使用 # 标题组织文章结构。</p>
                  )
                ) : (
                  <div className="writing-ai-placeholder">
                    <MessageSquare size={24} />
                    <strong>AI 写作助手</strong>
                    <p>稍后接入，先专注写作。</p>
                  </div>
                )}
              </TabsContent>
              <ResizeHandle side="right" width={rightWidth} onChange={setRightWidth} />
            </aside>
          </Tabs>,
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
