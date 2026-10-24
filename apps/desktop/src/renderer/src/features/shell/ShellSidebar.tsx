import { Button, IconButton } from '@jarvis/ui/components/Button';
import { useConfirm } from '@jarvis/ui/components/AlertDialog';
import { Alert } from '@jarvis/ui/components/Alert';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@jarvis/ui/components/Dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@jarvis/ui/components/DropdownMenu';
import { Ellipsis, Search } from '@jarvis/ui/icons';
import { useEffect, useRef, useState } from 'react';
import { SidebarItem } from '@jarvis/ui/components/SidebarItem';
import { Input } from '@jarvis/ui/components/Input';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import {
  LayoutGrid,
  SquarePen,
  MessageCircle,
  Settings,
  Cpu,
  Plug,
  Puzzle,
  Folder,
  Database,
  Info,
  Plus,
} from '@jarvis/ui/icons';
import type { Project } from '../creation/types';
import type { ChatSession } from '../../../../shared/agent';
import type { TabView } from './tabs';
type Section = 'general' | 'services' | 'models' | 'plugins';
export function ShellSidebar({
  kind,
  section,
  projects,
  activeProject,
  onCreate,
  onOpenProject,
  sessions,
  activeChat,
  onChat,
  onSettings,
  onBack,
  onRenameProject,
  onRenameChat,
  onDeleteChat,
  busy,
}: {
  kind: TabView['kind'];
  section: Section;
  projects: Project[];
  activeProject: string | null;
  onCreate: () => void;
  onOpenProject: (p: Project, newTab: boolean) => void;
  sessions: ChatSession[];
  activeChat: string | null;
  onChat: (id: string | null, title: string, newTab: boolean) => void;
  onSettings: (s: Section) => void;
  onBack: () => void;
  onRenameProject: (id: string, title: string) => Promise<boolean>;
  onRenameChat: (id: string, title: string) => Promise<boolean>;
  onDeleteChat: (id: string) => Promise<boolean>;
  busy: boolean;
}) {
  const confirm = useConfirm();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null),
    searchToggle = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  const [editing, setEditing] = useState<{
    kind: 'canvas' | 'chat';
    id: string;
    value: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const relativeTime = (time: number) => {
    const minutes = Math.max(0, Math.floor((now - time) / 60000));
    return minutes < 1
      ? '刚刚'
      : minutes < 60
        ? `${minutes} 分钟`
        : minutes < 1440
          ? `${Math.floor(minutes / 60)} 小时`
          : `${Math.floor(minutes / 1440)} 天`;
  };
  const actions = (kind: 'canvas' | 'chat', id: string, title: string) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton variant="ghost" size="icon-xs" aria-label={`更多 ${title}`}>
          <Ellipsis />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          disabled={busy || saving}
          onSelect={() => setEditing({ kind, id, value: title })}
        >
          重命名
        </DropdownMenuItem>
        {kind === 'chat' && (
          <DropdownMenuItem
            disabled={busy || saving}
            onSelect={() => {
              setSaving(true);
              void (async () => {
                try {
                  if (
                    await confirm({
                      title: '删除对话？',
                      message: `删除“${title}”后无法恢复。`,
                      confirmLabel: '删除对话',
                      tone: 'destructive',
                    })
                  ) {
                    if (!(await onDeleteChat(id))) setError('删除失败，请稍后重试');
                  }
                } catch (error) {
                  setError(error instanceof Error ? error.message : '操作失败');
                } finally {
                  setSaving(false);
                }
              })();
            }}
          >
            删除对话
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const [query, setQuery] = useState(''),
    [sort, setSort] = useState('recent');
  const filtered = projects
    .filter((p) => p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => (sort === 'recent' ? b.updatedAt - a.updatedAt : a.name.localeCompare(b.name)));
  return (
    <aside id="sidebar" className="shell-sidebar" aria-label="主导航">
      {kind === 'settings' ? (
        <>
          <button className="sidebar-back" onClick={onBack}>
            返回工作台
          </button>
          <h1>设置</h1>
          <nav aria-label="设置分类">
            {(
              [
                { id: 'general', name: '通用', Icon: Settings },
                { id: 'models', name: '模型服务', Icon: Cpu },
                { id: 'services', name: '内网地址', Icon: Plug },
                { id: 'plugins', name: '插件', Icon: Puzzle },
              ] as const
            ).map(({ id, name, Icon }) => (
              <SidebarItem
                key={id}
                data-testid="side-link"
                icon={<Icon />}
                selected={section === id}
                aria-current={section === id ? 'page' : undefined}
                onClick={() => onSettings(id)}
              >
                {name}
              </SidebarItem>
            ))}
            <SidebarItem disabled icon={<Folder />}>
              文件与权限
            </SidebarItem>
            <SidebarItem disabled icon={<Database />}>
              数据与隐私
            </SidebarItem>
            <SidebarItem disabled icon={<Info />}>
              关于 Jarvis
            </SidebarItem>
          </nav>
        </>
      ) : kind === 'canvas' ? (
        <>
          <div className="shell-sidebar-title">
            <h1>我的项目</h1>
            <IconButton
              ref={searchToggle}
              variant="ghost"
              size="icon-sm"
              aria-label={searchOpen ? '收起项目搜索' : '展开项目搜索'}
              aria-expanded={searchOpen}
              onClick={() => {
                if (searchOpen) setQuery('');
                setSearchOpen(!searchOpen);
              }}
            >
              <Search />
            </IconButton>
          </div>
          {searchOpen && (
            <Input
              ref={searchInput}
              aria-label="搜索项目"
              placeholder="搜索项目"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setQuery('');
                  setSearchOpen(false);
                  requestAnimationFrame(() => searchToggle.current?.focus());
                }
              }}
            />
          )}
          <SidebarItem icon={<Plus />} onClick={onCreate}>
            新建项目
          </SidebarItem>
          <div className="shell-sidebar-heading">
            <NativeSelect
              appearance="compact"
              aria-label="项目排序"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="recent">最近编辑</option>
              <option value="name">名称排序</option>
            </NativeSelect>
            <span>{filtered.length} 个项目</span>
          </div>
          {filtered.map((p) => (
            <SidebarItem
              key={p.id}
              data-testid="project-row"
              icon={<LayoutGrid />}
              selected={p.id === activeProject}
              aria-current={p.id === activeProject ? 'page' : undefined}
              meta={relativeTime(p.updatedAt)}
              trailing={actions('canvas', p.id, p.name)}
              onClick={(e) => onOpenProject(p, e.metaKey || e.ctrlKey)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onOpenProject(p, true);
                }
              }}
            >
              {p.name}
            </SidebarItem>
          ))}
          {query && !filtered.length && <p>没有找到匹配的项目</p>}
        </>
      ) : (
        <>
          <h1>Jarvis</h1>
          <SidebarItem
            icon={<SquarePen />}
            onClick={(e) => onChat(null, '新对话', e.metaKey || e.ctrlKey)}
          >
            新对话
          </SidebarItem>
          <div data-testid="chat-history" className="shell-chat-history" aria-label="聊天记录">
            <small>最近对话</small>
            {[...sessions]
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .map((s) => (
                <SidebarItem
                  key={s.id}
                  data-testid="side-link"
                  aria-label={`打开对话：${s.title}`}
                  icon={<MessageCircle />}
                  meta={relativeTime(s.updatedAt)}
                  trailing={actions('chat', s.id, s.title)}
                  selected={activeChat === s.id}
                  aria-current={activeChat === s.id ? 'page' : undefined}
                  onClick={(e) => onChat(s.id, s.title, e.metaKey || e.ctrlKey)}
                  onAuxClick={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      onChat(s.id, s.title, true);
                    }
                  }}
                >
                  {s.title}
                  {s.runId && <span aria-label="回复中"> •</span>}
                </SidebarItem>
              ))}
            {!sessions.length && <p>还没有对话</p>}
          </div>
        </>
      )}
      {error && (
        <Alert tone="error" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !saving) setEditing(null);
        }}
      >
        <DialogContent size="sm" className="p-5">
          <DialogTitle>重命名{editing?.kind === 'canvas' ? '项目' : '对话'}</DialogTitle>
          <DialogDescription>输入新的名称。</DialogDescription>
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!editing || saving || !editing.value.trim()) return;
              const edit = editing;
              setSaving(true);
              void (async () => {
                try {
                  const ok = await (edit.kind === 'canvas' ? onRenameProject : onRenameChat)(
                    edit.id,
                    edit.value.trim(),
                  );
                  if (ok) setEditing(null);
                  else setError('重命名失败，请稍后重试');
                } catch (error) {
                  setError(error instanceof Error ? error.message : '操作失败');
                } finally {
                  setSaving(false);
                }
              })();
            }}
          >
            <Input
              aria-label="新名称"
              maxLength={editing?.kind === 'canvas' ? 80 : 100}
              value={editing?.value ?? ''}
              onChange={(e) => setEditing((v) => (v ? { ...v, value: e.target.value } : v))}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" disabled={saving} onClick={() => setEditing(null)}>
                取消
              </Button>
              <Button type="submit" disabled={saving || !editing?.value.trim()}>
                保存名称
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
