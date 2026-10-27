import type { OsSnapshot, ThreadView } from '../../../../shared/agent-os';

/**
 * What a home tab shows. Its `ref` is null (the current project's conversation), a session ID
 * (a Coordinator or a thread), or `overview:<projectId>` / `project:<projectId>`.
 */
export type AgentPlace =
  | { kind: 'home' }
  | { kind: 'session'; id: string }
  | { kind: 'overview'; projectId: string }
  | { kind: 'project'; projectId: string };

export function placeOf(ref: string | null): AgentPlace {
  if (!ref) return { kind: 'home' };
  if (ref.startsWith('overview:')) return { kind: 'overview', projectId: ref.slice(9) };
  if (ref.startsWith('project:')) return { kind: 'project', projectId: ref.slice(8) };
  return { kind: 'session', id: ref };
}

/** Whether a home tab's place still exists in the snapshot. */
export function placeExists(snapshot: OsSnapshot, ref: string | null) {
  const place = placeOf(ref);
  if (place.kind === 'home') return true;
  if (place.kind === 'session')
    return (
      snapshot.projects.some((p) => p.coordinatorId === place.id) ||
      snapshot.threads.some((t) => t.id === place.id)
    );
  return snapshot.projects.some((p) => p.id === place.projectId);
}

/** A home tab's title: the project for its conversation, the thread, or the page's name. */
export function placeTitle(snapshot: OsSnapshot, ref: string | null) {
  const place = placeOf(ref);
  if (place.kind === 'overview') return 'Overview';
  if (place.kind === 'project') return '项目设置';
  if (place.kind === 'home')
    return (
      snapshot.projects.find((p) => p.id === snapshot.currentProjectId)?.title ?? 'Jarvis Chat'
    );
  return (
    snapshot.projects.find((p) => p.coordinatorId === place.id)?.title ??
    snapshot.threads.find((t) => t.id === place.id)?.title
  );
}

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

/** A thread waits on the user: an open card, or an irreversible step held for approval. */
export function waitsOnUser(thread: ThreadView) {
  return thread.decisions.length > 0 || thread.state === 'blocked';
}

function wakeTime(at: number, now: number) {
  const date = new Date(at);
  const today = new Date(now);
  const time = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return `今天 ${time}`;
  today.setDate(today.getDate() + 1);
  if (date.toDateString() === today.toDateString())
    return date.getHours() < 12 ? `明早 ${time}` : `明天 ${time}`;
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(time: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return minutes < 2880 ? '昨天' : `${Math.floor(minutes / 1440)} 天前`;
}

/** How a thread's state reads in lists, badges and the Overview. */
export function threadStatus(thread: ThreadView, running: boolean, now = Date.now()) {
  const done = thread.checklist.filter((c) => c.status === 'done').length;
  const progress = thread.checklist.length ? ` ${done}/${thread.checklist.length}` : '';
  if (thread.decisions.some((d) => d.tool || d.budget))
    return { label: '等你批准', tone: 'warning' as Tone, meta: '等你批准' };
  if (waitsOnUser(thread)) return { label: '等你决定', tone: 'warning' as Tone, meta: '等你决定' };
  if (running || thread.state === 'working')
    return { label: '进行中', tone: 'info' as Tone, meta: `进行中${progress}` };
  if (thread.state === 'review_ready')
    return { label: '待查看', tone: 'success' as Tone, meta: '待查看' };
  if (thread.state === 'done')
    return { label: '已完成', tone: 'neutral' as Tone, meta: relativeTime(thread.updatedAt, now) };
  if (thread.state === 'failed') return { label: '失败', tone: 'danger' as Tone, meta: '失败' };
  if (thread.state === 'stopped')
    return { label: '已停止', tone: 'neutral' as Tone, meta: '已停止' };
  const next = Math.min(...thread.wakes.map((w) => w.fireAt ?? Infinity));
  if (Number.isFinite(next))
    return { label: '等待唤醒', tone: 'neutral' as Tone, meta: wakeTime(next, now) };
  if (thread.wakes.length) return { label: '等待唤醒', tone: 'neutral' as Tone, meta: '订阅中' };
  return { label: '空闲', tone: 'neutral' as Tone, meta: relativeTime(thread.updatedAt, now) };
}

/** Threads of one project, sorted most recent first. */
export function projectThreads(snapshot: OsSnapshot, projectId: string) {
  return snapshot.threads
    .filter((t) => t.projectId === projectId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** How many things in a project wait on the user: open decision cards and blocked threads. */
export function waitingCount(snapshot: OsSnapshot, projectId: string) {
  return projectThreads(snapshot, projectId).reduce(
    (n, t) => n + (t.decisions.length || (t.state === 'blocked' ? 1 : 0)),
    0,
  );
}
