import { useState } from 'react';
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
}) {
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
          <h1>我的项目</h1>
          <Input
            aria-label="搜索项目"
            placeholder="搜索项目"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
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
              meta={new Date(p.updatedAt).toLocaleDateString('zh-CN')}
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
    </aside>
  );
}
