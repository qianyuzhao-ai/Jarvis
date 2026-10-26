import { useEffect, useState } from 'react';
import { Button } from '@jarvis/ui/components/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jarvis/ui/components/DropdownMenu';
import { SidebarItem } from '@jarvis/ui/components/SidebarItem';
import {
  Check,
  ChevronDown,
  ListTodo,
  MessageCircle,
  Plus,
  Settings,
  Workflow,
} from '@jarvis/ui/icons';
import { osValue, type OsSnapshot } from '../../../../shared/agent-os';
import { osBridge } from './use-agent';
import { placeOf, projectThreads, relativeTime, threadStatus, waitingCount } from './os-view';
import type { OpenPlace } from './AgentViews';

/**
 * The home sidebar: the current project, its Overview and conversation, and its threads. A
 * project has one conversation; new projects start from the project menu.
 */
export function ProjectSidebar({
  snapshot,
  activeRef,
  onOpen,
  onError,
}: {
  snapshot: OsSnapshot;
  /** The active home tab's ref; null shows the current project's conversation. */
  activeRef: string | null | undefined;
  onOpen: OpenPlace;
  onError: (message: string) => void;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const current = snapshot.projects.find((p) => p.id === snapshot.currentProjectId) ?? null;
  const place = activeRef === undefined ? null : placeOf(activeRef);
  const threads = current ? projectThreads(snapshot, current.id).filter((t) => !t.resolved) : [];
  const finished = threads.filter((t) => t.state === 'done');
  const active = threads.filter((t) => t.state !== 'done');
  const waiting = current ? waitingCount(snapshot, current.id) : 0;
  async function switchTo(projectId: string) {
    try {
      osValue(await osBridge().setCurrentProject(projectId));
      const project = snapshot.projects.find((p) => p.id === projectId);
      if (project) onOpen(project.coordinatorId, '协调对话');
    } catch (error) {
      onError(error instanceof Error ? error.message : '切换项目失败');
    }
  }
  async function create() {
    try {
      const id = osValue(await osBridge().createProject('新项目'));
      const created = osValue(await osBridge().getSnapshot()).snapshot.projects.find(
        (p) => p.id === id,
      );
      if (created) onOpen(created.coordinatorId, '协调对话');
    } catch (error) {
      onError(error instanceof Error ? error.message : '新建项目失败');
    }
  }
  const selected = (ref: string) =>
    place?.kind === 'session'
      ? place.id === ref
      : place?.kind === 'home'
        ? ref === current?.coordinatorId
        : false;
  const thread = (t: (typeof threads)[number]) => (
    <SidebarItem
      key={t.id}
      data-testid="thread-link"
      aria-label={`打开线程：${t.title}`}
      icon={t.state === 'done' ? <Check /> : <Workflow />}
      meta={threadStatus(t, t.id in snapshot.runs, now).meta}
      selected={selected(t.id)}
      aria-current={selected(t.id) ? 'page' : undefined}
      onClick={(e) => onOpen(t.id, t.title, e.metaKey || e.ctrlKey)}
    >
      {t.title}
      {t.id in snapshot.runs && <span aria-label="工作中"> •</span>}
    </SidebarItem>
  );
  return (
    <>
      <div className="shell-sidebar-title">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" aria-label="切换项目" data-testid="project-switcher">
              {current?.title ?? 'Jarvis'}
              <ChevronDown size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="shell-row-menu">
            {snapshot.projects.map((p) => (
              <DropdownMenuItem key={p.id} onSelect={() => void switchTo(p.id)}>
                <span className="flex-1">{p.title}</span>
                {p.id === current?.id && <Check size={14} />}
              </DropdownMenuItem>
            ))}
            {snapshot.projects.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => void create()}>
              <Plus size={14} />
              新建项目
            </DropdownMenuItem>
            {current && (
              <DropdownMenuItem onSelect={() => onOpen(`project:${current.id}`, '项目设置')}>
                <Settings size={14} />
                项目设置
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {current && (
        <SidebarItem
          data-testid="overview-link"
          icon={<ListTodo />}
          meta={waiting ? `${waiting} 件等你` : undefined}
          selected={place?.kind === 'overview' && place.projectId === current.id}
          onClick={(e) => onOpen(`overview:${current.id}`, 'Overview', e.metaKey || e.ctrlKey)}
        >
          Overview
        </SidebarItem>
      )}
      <SidebarItem
        data-testid="side-link"
        aria-label="打开协调对话"
        icon={<MessageCircle />}
        meta={current ? relativeTime(current.updatedAt, now) : undefined}
        selected={current ? selected(current.coordinatorId) : place?.kind === 'home'}
        onClick={(e) => onOpen(current?.coordinatorId ?? null, '协调对话', e.metaKey || e.ctrlKey)}
      >
        协调对话
        {current && current.coordinatorId in snapshot.runs && <span aria-label="回复中"> •</span>}
      </SidebarItem>
      <div data-testid="thread-list" className="shell-chat-history" aria-label="线程">
        {active.length > 0 && (
          <section className="shell-chat-group" aria-label="线程">
            <small>线程</small>
            {active.map(thread)}
          </section>
        )}
        {finished.length > 0 && (
          <section className="shell-chat-group" aria-label="已完成">
            <small>已完成</small>
            {finished.map(thread)}
          </section>
        )}
      </div>
      {current && (
        <p className="os-sidebar-foot" data-testid="os-sidebar-foot">
          {current.folders.length} 个可访问目录
        </p>
      )}
    </>
  );
}
