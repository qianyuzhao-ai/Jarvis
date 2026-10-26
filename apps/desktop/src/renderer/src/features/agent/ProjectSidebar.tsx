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
      if (project) onOpen(project.coordinatorId, 'Jarvis Chat');
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
      if (created) onOpen(created.coordinatorId, 'Jarvis Chat');
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
      <div className="shell-sidebar-title mx-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="切换项目"
              data-testid="project-switcher"
              className="os-project-switcher h-8 min-w-0 flex-1 pr-1 pl-2 [&>.ui-button-content]:min-w-0 [&>.ui-button-content]:flex-1 [&>.ui-button-content]:justify-between"
            >
              <span className="min-w-0 truncate">{current?.title ?? 'Jarvis'}</span>
              <ChevronDown size={14} className="shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="os-project-menu">
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
      <div className="flex flex-col gap-1">
        <SidebarItem
          data-testid="side-link"
          aria-label="打开 Jarvis Chat"
          icon={<MessageCircle />}
          meta={current ? relativeTime(current.updatedAt, now) : undefined}
          selected={current ? selected(current.coordinatorId) : place?.kind === 'home'}
          onClick={(e) =>
            onOpen(current?.coordinatorId ?? null, 'Jarvis Chat', e.metaKey || e.ctrlKey)
          }
        >
          Jarvis Chat
          {current && current.coordinatorId in snapshot.runs && <span aria-label="回复中"> •</span>}
        </SidebarItem>
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
      </div>
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
    </>
  );
}
