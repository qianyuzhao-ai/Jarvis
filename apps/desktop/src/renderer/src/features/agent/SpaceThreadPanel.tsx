import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Alert } from '@jarvis/ui/components/Alert';
import { AssistantPanel } from '@jarvis/ui/components/AssistantPanel';
import { Badge, StatusDot } from '@jarvis/ui/components/Badge';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { SidebarItem } from '@jarvis/ui/components/SidebarItem';
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronLeft,
  History,
  SquarePen,
  Workflow,
  X,
} from '@jarvis/ui/icons';
import type { CanvasActivityActions, WritingActivityActions } from './ChatActivity';
import { ChatMessageItem } from './ChatMessageItem';
import { Checklist, DecisionCard } from './AgentCards';
import { threadStatus } from './os-view';
import { openThread } from './open-thread';
import type { useSpaceThread } from './use-space-thread';

/**
 * A canvas or document sidebar: the thread bound to it, compact. The header names the thread and
 * its state, a bar names its project and opens the full view, progress stays pinned in one line,
 * and decision cards sit after the messages. History lists this target's threads.
 */
export function SpaceThreadPanel({
  space,
  label,
  closeLabel,
  onClose,
  composer,
  canvas,
  writing,
  empty,
  historyNote,
  before,
  after,
  ...panel
}: Omit<ComponentProps<typeof AssistantPanel>, 'title' | 'composer'> & {
  space: ReturnType<typeof useSpaceThread>;
  /** “画布助手” or “写作助手”: the panel's name while no thread is open. */
  label: string;
  closeLabel: string;
  onClose: () => void;
  composer: ReactNode;
  canvas?: CanvasActivityActions;
  writing?: WritingActivityActions;
  /** What an empty new thread shows. */
  empty: ReactNode;
  historyNote?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
}) {
  const { session, thread, project } = space;
  const [history, setHistory] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [now, setNow] = useState(Date.now);
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const last = session?.messages.at(-1);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const node = viewport.current;
    if (node && following.current) node.scrollTop = node.scrollHeight;
  }, [last?.text, last?.activities?.length, last?.status, thread?.decisions.length]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (following.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const running = !!thread && thread.id in space.snapshot.runs;
  const status = thread ? threadStatus(thread, running, now) : null;
  const checklist = thread?.checklist ?? [];
  const done = checklist.filter((c) => c.status === 'done').length;
  const doing = checklist.find((c) => c.status === 'doing');
  const open = space.threads.filter((t) => !t.resolved && t.state !== 'done');
  const finished = space.threads.filter((t) => t.resolved || t.state === 'done');
  const item = (t: (typeof space.threads)[number]) => (
    <SidebarItem
      key={t.id}
      data-testid="space-thread"
      icon={t.state === 'done' ? <Check /> : <Workflow />}
      meta={threadStatus(t, t.id in space.snapshot.runs, now).meta}
      selected={t.id === session?.id}
      onClick={() => {
        space.select(t.id);
        setHistory(false);
      }}
    >
      {t.title}
    </SidebarItem>
  );
  const header = (
    <>
      <header data-testid="space-thread-header" className="space-thread-header">
        {history && (
          <IconButton
            variant="ghost"
            size="icon-sm"
            aria-label="返回当前线程"
            onClick={() => setHistory(false)}
          >
            <ChevronLeft size={18} />
          </IconButton>
        )}
        <strong title={history ? '线程历史' : (thread?.title ?? label)}>
          {history ? '线程历史' : (thread?.title ?? label)}
        </strong>
        {!history && status && <Badge tone={status.tone}>{status.label}</Badge>}
        <span className="space-thread-spacer" />
        {!history && (
          <IconButton
            variant="ghost"
            size="icon-sm"
            aria-label="线程历史"
            onClick={() => setHistory(true)}
          >
            <History size={18} />
          </IconButton>
        )}
        <IconButton
          variant="ghost"
          size="icon-sm"
          aria-label="新线程"
          onClick={() => {
            space.newThread();
            setHistory(false);
          }}
        >
          <SquarePen size={18} />
        </IconButton>
        <IconButton variant="ghost" size="icon-sm" aria-label={closeLabel} onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>
      {!history && thread && (
        <div className="space-thread-bar">
          <span>线程 · {project?.title}</span>
          <Button variant="ghost" size="sm" onClick={() => openThread(thread.id)}>
            在首页查看
          </Button>
        </div>
      )}
      {!history && checklist.length > 0 && (
        <button
          type="button"
          data-testid="space-thread-progress"
          className="space-thread-progress"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {done === checklist.length ? (
            <Check size={14} />
          ) : (
            <StatusDot tone={doing ? 'accent' : 'neutral'} />
          )}
          <span>
            进度 {done} / {checklist.length}
            {done === checklist.length ? ' · 已完成' : doing ? ` · ${doing.text}` : ''}
          </span>
          <ChevronDown size={14} />
        </button>
      )}
      {!history && expanded && <Checklist items={checklist} />}
    </>
  );
  return (
    <AssistantPanel
      {...panel}
      title={label}
      header={header}
      composer={history ? undefined : composer}
    >
      {before}
      {space.error && (
        <Alert tone="error" onDismiss={() => space.setError('')} closeLabel="关闭">
          {space.error}
        </Alert>
      )}
      {history ? (
        <div data-testid="space-thread-history" className="space-thread-history">
          <p className="os-muted">
            所属项目 · {project?.title ?? space.current?.title ?? '尚未开始'}
          </p>
          {open.length > 0 && <small>进行中</small>}
          {open.map(item)}
          {finished.length > 0 && <small>已完成</small>}
          {finished.map(item)}
          {!space.threads.length && <p className="os-muted">还没有线程。发一条消息就会开一个。</p>}
          {historyNote}
        </div>
      ) : (
        <div
          className="space-thread-scroll"
          ref={viewport}
          onScroll={() => {
            const n = viewport.current;
            if (n) {
              following.current = n.scrollHeight - n.scrollTop - n.clientHeight < 64;
              setAtBottom(following.current);
            }
          }}
        >
          {!session?.messages.length ? (
            empty
          ) : (
            <div className="chat-messages" role="log" aria-label={`${label}消息`} aria-live="off">
              {session.messages.map((m) => (
                <ChatMessageItem
                  key={m.id}
                  message={m}
                  waiting={space.waiting}
                  sessionId={session.id}
                  now={now}
                  onError={space.setError}
                  canvas={canvas}
                  writing={writing}
                />
              ))}
              {thread?.decisions.map((d) => (
                <DecisionCard key={d.id} decision={d} compact onError={space.setError} />
              ))}
              {after}
            </div>
          )}
          {!atBottom && (
            <Button
              variant="secondary"
              size="sm"
              className="space-thread-latest"
              onClick={() => {
                const n = viewport.current;
                if (n) n.scrollTop = n.scrollHeight;
                following.current = true;
                setAtBottom(true);
              }}
            >
              <ArrowDown size={14} />
              回到最新
            </Button>
          )}
        </div>
      )}
    </AssistantPanel>
  );
}
