import { useEffect, useState } from 'react';
import { Badge } from '@jarvis/ui/components/Badge';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Alert } from '@jarvis/ui/components/Alert';
import { useConfirm } from '@jarvis/ui/components/AlertDialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@jarvis/ui/components/Collapsible';
import { Field, FieldLabel, FieldDescription } from '@jarvis/ui/components/Field';
import { Input } from '@jarvis/ui/components/Input';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { Progress } from '@jarvis/ui/components/Progress';
import { Textarea } from '@jarvis/ui/components/Textarea';
import {
  Brain,
  ChevronLeft,
  CircleAlert,
  Clock,
  FileText,
  Folder,
  FolderPlus,
  ListTodo,
  Settings,
  Workflow,
  X,
} from '@jarvis/ui/icons';
import {
  osValue,
  type MemoryTopic,
  type OsMessage,
  type OsSnapshot,
  type ThreadView,
} from '../../../../shared/agent-os';
import { ChatPage } from './ChatPage';
import { Checklist, DecisionCard, ThreadCard, ThreadNotice } from './AgentCards';
import { osBridge, useAgent, useOsSnapshot } from './use-agent';
import {
  placeOf,
  projectThreads,
  relativeTime,
  threadStatus,
  waitingCount,
  waitsOnUser,
} from './os-view';

/** Opens a home place (conversation, thread, Overview or project settings) in this tab. */
export type OpenPlace = (ref: string | null, title: string, newTab?: boolean) => void;
const overviewRef = (projectId: string) => `overview:${projectId}`;
const projectRef = (projectId: string) => `project:${projectId}`;

/**
 * A home tab: the current project's conversation, a Coordinator or thread conversation, a
 * project's Overview or its settings.
 */
export function AgentTab({
  tabRef,
  onOpen,
  onPlace,
  onConfigure,
}: {
  tabRef: string | null;
  onOpen: OpenPlace;
  /** The tab now shows this place, e.g. after its first message started a project. */
  onPlace: (ref: string, title: string) => void;
  onConfigure: () => void;
}) {
  const place = placeOf(tabRef);
  if (place.kind === 'overview')
    return <OverviewView projectId={place.projectId} onOpen={onOpen} />;
  if (place.kind === 'project')
    return <ProjectSettingsView projectId={place.projectId} onOpen={onOpen} />;
  return (
    <ConversationTab
      sessionId={place.kind === 'session' ? place.id : null}
      onOpen={onOpen}
      onPlace={onPlace}
      onConfigure={onConfigure}
    />
  );
}

function ConversationTab({
  sessionId,
  onOpen,
  onPlace,
  onConfigure,
}: {
  sessionId: string | null;
  onOpen: OpenPlace;
  onPlace: (ref: string, title: string) => void;
  onConfigure: () => void;
}) {
  const os = useOsSnapshot();
  // With no session, the tab shows the current project's conversation.
  const id = sessionId ?? os.current?.coordinatorId ?? null;
  const agent = useAgent(id, (created) => onPlace(created, 'Jarvis Chat'));
  if (agent.thread) return <ThreadPage agent={agent} onOpen={onOpen} onConfigure={onConfigure} />;
  return <CoordinatorPage agent={agent} onOpen={onOpen} onConfigure={onConfigure} />;
}

type Agent = ReturnType<typeof useAgent>;

function CoordinatorPage({
  agent,
  onOpen,
  onConfigure,
}: {
  agent: Agent;
  onOpen: OpenPlace;
  onConfigure: () => void;
}) {
  const { snapshot, project } = agent;
  const waiting = project ? waitingCount(snapshot, project.id) : 0;
  const threadOf = (id?: string) => snapshot.threads.find((t) => t.id === id);
  const header = project && (
    <header className="os-view-header" data-testid="coordinator-header">
      <div>
        <strong>Jarvis Chat</strong>
        <span>{project.title} · Jarvis 理解你的话，把工作分给线程，并汇总结果</span>
      </div>
      <Button variant="ghost" size="sm" onClick={() => onOpen(overviewRef(project.id), 'Overview')}>
        <ListTodo size={16} />
        {waiting ? `Overview · ${waiting} 件等你` : 'Overview'}
      </Button>
      <IconButton
        variant="ghost"
        size="icon-sm"
        aria-label="项目设置"
        onClick={() => onOpen(projectRef(project.id), '项目设置')}
      >
        <Settings size={16} />
      </IconButton>
    </header>
  );
  return (
    <ChatPage
      agent={agent}
      onConfigure={onConfigure}
      header={header}
      placeholder="和 Jarvis 说要做什么，它会分给线程…"
      renderMessage={(message: OsMessage) => {
        if (message.source?.kind !== 'task_done') return undefined;
        const thread = threadOf(message.source.threadId);
        return (
          <ThreadNotice
            text={message.text}
            onOpen={thread ? () => onOpen(thread.id, thread.title) : undefined}
          />
        );
      }}
      afterMessage={(message: OsMessage) => {
        const threads = (message.threadIds ?? []).flatMap((id) => {
          const thread = threadOf(id);
          return thread ? [thread] : [];
        });
        if (!threads.length) return null;
        return (
          <div className="os-thread-cards" data-testid="thread-cards">
            {threads.map((t) => (
              <ThreadCard
                key={t.id}
                thread={t}
                running={t.id in snapshot.runs}
                onOpen={() => onOpen(t.id, t.title)}
              />
            ))}
          </div>
        );
      }}
    />
  );
}

function ThreadPage({
  agent,
  onOpen,
  onConfigure,
}: {
  agent: Agent;
  onOpen: OpenPlace;
  onConfigure: () => void;
}) {
  const { thread, project, snapshot } = agent;
  if (!thread || !project) return null;
  const running = thread.id in snapshot.runs;
  const status = threadStatus(thread, running);
  const mounts = [...new Set(thread.mounts.map((m) => m.pack))];
  const stoppable =
    thread.state !== 'stopped' &&
    (running || thread.state === 'working' || thread.wakes.length > 0 || waitsOnUser(thread));
  const header = (
    <header className="os-view-header" data-testid="thread-header">
      <IconButton
        variant="ghost"
        size="icon-sm"
        aria-label="返回 Jarvis Chat"
        onClick={() => onOpen(project.coordinatorId, 'Jarvis Chat')}
      >
        <ChevronLeft size={16} />
      </IconButton>
      <div>
        <strong>
          {thread.title}
          <Badge tone={status.tone}>{status.label}</Badge>
        </strong>
        <span>
          线程 · {project.title}
          {mounts.length ? ` · 写能力：${mounts.join('、')}` : ' · 只读'}
        </span>
      </div>
      {stoppable && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void agent.act(async () => osValue(await osBridge().stopThread(thread.id)), '停止失败')
          }
        >
          停止
        </Button>
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          void agent.act(
            async () =>
              osValue(
                await osBridge().resolveThread({ threadId: thread.id, resolved: !thread.resolved }),
              ),
            '操作失败',
          )
        }
      >
        {thread.resolved ? '重新打开' : '标记已解决'}
      </Button>
    </header>
  );
  return (
    <ChatPage
      agent={agent}
      onConfigure={onConfigure}
      header={header}
      placeholder="直接对这个线程说（不经过 Jarvis Chat）…"
      before={<Checklist items={thread.checklist} />}
      after={
        thread.decisions.length ? (
          <div className="os-decisions">
            {thread.decisions.map((d) => (
              <DecisionCard key={d.id} decision={d} onError={agent.setError} />
            ))}
          </div>
        ) : undefined
      }
    />
  );
}

function ThreadRow({
  thread,
  snapshot,
  onOpen,
}: {
  thread: ThreadView;
  snapshot: OsSnapshot;
  onOpen: OpenPlace;
}) {
  const running = thread.id in snapshot.runs;
  const status = threadStatus(thread, running);
  const done = thread.checklist.filter((c) => c.status === 'done').length;
  const waitingWake = status.label === '等待唤醒';
  return (
    <button
      type="button"
      className="os-row"
      data-testid="overview-thread"
      aria-label={`打开线程：${thread.title}`}
      onClick={() => onOpen(thread.id, thread.title)}
    >
      {waitingWake ? (
        <Clock size={16} />
      ) : thread.card ? (
        <FileText size={16} />
      ) : (
        <Workflow size={16} />
      )}
      <span className="os-row-text">
        <strong>{thread.title}</strong>
        {status.label === '进行中' && thread.checklist.length > 0 && (
          <Progress size="small" value={done} max={thread.checklist.length} aria-label="线程进度" />
        )}
        <span>{thread.card?.summary || status.meta}</span>
      </span>
      <Badge tone={status.tone}>{status.label}</Badge>
    </button>
  );
}

export function OverviewView({ projectId, onOpen }: { projectId: string; onOpen: OpenPlace }) {
  const os = useOsSnapshot();
  const { snapshot } = os;
  const project = snapshot.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const threads = projectThreads(snapshot, projectId);
  const open = threads.filter((t) => !t.resolved);
  const waiting = open.filter(waitsOnUser);
  const review = open.filter((t) => !waitsOnUser(t) && t.state === 'review_ready');
  const finished = open.filter(
    (t) => !waitsOnUser(t) && ['done', 'failed', 'stopped'].includes(t.state),
  );
  const working = open.filter(
    (t) => !waiting.includes(t) && !review.includes(t) && !finished.includes(t),
  );
  const resolved = threads.filter((t) => t.resolved);
  const group = (
    label: string,
    items: ThreadView[],
    body = items.map((t) => (
      <ThreadRow key={t.id} thread={t} snapshot={snapshot} onOpen={onOpen} />
    )),
  ) =>
    items.length > 0 && (
      <section className="os-group" aria-label={label} data-testid={`overview-${label}`}>
        <h2>
          {label} <span className="os-muted">{items.length}</span>
        </h2>
        {body}
      </section>
    );
  return (
    <section className="os-page" data-testid="overview" aria-label="Overview">
      <header className="os-view-header">
        <div>
          <strong>Overview</strong>
          <span>{project.title} · 按状态看所有线程；等你的事放在最前面</span>
        </div>
      </header>
      {os.error && (
        <Alert tone="error" onDismiss={() => os.setError('')}>
          {os.error}
        </Alert>
      )}
      <div className="os-page-scroll">
        <div className="os-page-body">
          {!threads.length && (
            <p className="os-muted">还没有线程。在 Jarvis Chat 里说一件事，Jarvis 会开线程去做。</p>
          )}
          {group(
            '等你',
            waiting,
            waiting.flatMap((t) =>
              t.decisions.length
                ? t.decisions.map((d) =>
                    d.tool || d.budget ? (
                      <DecisionCard
                        key={d.id}
                        decision={d}
                        threadTitle={t.title}
                        onError={os.setError}
                      />
                    ) : (
                      // Questions are answered in the thread, next to its context.
                      <div key={d.id} className="os-row" data-testid="overview-question">
                        <CircleAlert size={16} className="os-info-icon" />
                        <span className="os-row-text">
                          <strong>{d.question}</strong>
                          <span>
                            {t.title} · 推荐「{d.options[d.recommended]?.label}
                            」，线程已先按推荐项推进
                          </span>
                        </span>
                        <Button variant="secondary" size="sm" onClick={() => onOpen(t.id, t.title)}>
                          去回答
                        </Button>
                      </div>
                    ),
                  )
                : [<ThreadRow key={t.id} thread={t} snapshot={snapshot} onOpen={onOpen} />],
            ),
          )}
          {group('待你查看', review)}
          {group('进行中', working)}
          {finished.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger meta={`${finished.length}`}>已完成</CollapsibleTrigger>
              <CollapsibleContent>
                {finished.map((t) => (
                  <ThreadRow key={t.id} thread={t} snapshot={snapshot} onOpen={onOpen} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
          {resolved.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger meta={`${resolved.length} · 已隐藏，可重开`}>
                已解决
              </CollapsibleTrigger>
              <CollapsibleContent>
                {resolved.map((t) => (
                  <ThreadRow key={t.id} thread={t} snapshot={snapshot} onOpen={onOpen} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </div>
    </section>
  );
}

const MODES = [
  ['normal', '正常：可撤销的直接做，不可逆的先问你'],
  ['plan', '计划：只读取和出方案，不做修改'],
] as const;
const BUDGETS = [500_000, 2_000_000, 5_000_000, 10_000_000];

export function ProjectSettingsView({
  projectId,
  onOpen,
}: {
  projectId: string;
  onOpen: OpenPlace;
}) {
  const confirm = useConfirm();
  const os = useOsSnapshot();
  const project = os.snapshot.projects.find((p) => p.id === projectId);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [memory, setMemory] = useState<MemoryTopic[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const loaded = !!project;
  const savedTitle = project?.title ?? '';
  const savedInstructions = project?.instructions ?? '';
  useEffect(() => {
    if (!loaded) return;
    setTitle(savedTitle);
    setInstructions(savedInstructions);
  }, [loaded, savedTitle, savedInstructions]);
  // Memory is written during rounds, so reread it whenever this project or one of its threads moves.
  const lastActivity = Math.max(
    project?.updatedAt ?? 0,
    ...projectThreads(os.snapshot, projectId).map((t) => t.updatedAt),
  );
  useEffect(() => {
    if (!loaded) return;
    void osBridge()
      .listMemory(projectId)
      .then((result) => {
        if (result.ok) setMemory(result.value);
      });
  }, [loaded, projectId, lastActivity]);
  if (!project) return null;
  async function run(action: () => Promise<unknown>, done = '已保存') {
    setBusy(true);
    setStatus('');
    try {
      await action();
      setStatus(done);
    } catch (error) {
      os.setError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }
  const patch = (value: Parameters<ReturnType<typeof osBridge>['updateProject']>[0]['patch']) =>
    run(async () => osValue(await osBridge().updateProject({ id: projectId, patch: value })));
  const dirty = title.trim() !== project.title || instructions !== project.instructions;
  return (
    <section className="os-page" data-testid="project-settings" aria-label="项目设置">
      <header className="os-view-header">
        <IconButton
          variant="ghost"
          size="icon-sm"
          aria-label="返回 Jarvis Chat"
          onClick={() => onOpen(project.coordinatorId, 'Jarvis Chat')}
        >
          <ChevronLeft size={16} />
        </IconButton>
        <div>
          <strong>项目设置</strong>
          <span>一个项目就是一个 Jarvis：自己的 Jarvis Chat、线程、记忆和可访问目录</span>
        </div>
        <span role="status" className="os-muted">
          {status}
        </span>
      </header>
      {os.error && (
        <Alert tone="error" onDismiss={() => os.setError('')}>
          {os.error}
        </Alert>
      )}
      <div className="os-page-scroll">
        <form
          className="os-page-body os-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty && title.trim()) void patch({ title: title.trim(), instructions });
          }}
        >
          <Field>
            <FieldLabel>项目名称</FieldLabel>
            <Input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>项目说明</FieldLabel>
            <FieldDescription>
              每一轮都会读给协调者和所有线程，写常驻规则；以后还会用到的偏好由 Jarvis 记进项目记忆。
            </FieldDescription>
            <Textarea
              value={instructions}
              rows={5}
              maxLength={16000}
              showCount
              onChange={(e) => setInstructions(e.target.value)}
            />
          </Field>
          <div className="os-form-actions">
            <Button type="submit" size="sm" disabled={busy || !dirty || !title.trim()}>
              保存名称与说明
            </Button>
          </div>
          <section className="os-form-section" aria-label="可访问目录">
            <h2>可访问目录</h2>
            <p className="os-muted">
              线程只能在这些目录里读写文件，越界一律拦截。“项目文件”是项目自带的产物目录。
            </p>
            {project.folders.map((folder) => (
              <div
                key={folder.id}
                className="os-row"
                data-testid="folder-row"
                title={folder.directory}
              >
                <Folder size={16} />
                <span className="os-row-text">
                  <strong>{folder.name}</strong>
                  <span>{folder.directory}</span>
                </span>
                {folder.name === '项目文件' ? (
                  <Badge>自带</Badge>
                ) : (
                  <IconButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`移除目录：${folder.name}`}
                    disabled={busy}
                    onClick={() =>
                      void run(async () =>
                        osValue(await osBridge().removeFolder({ projectId, folderId: folder.id })),
                      )
                    }
                  >
                    <X size={16} />
                  </IconButton>
                )}
              </div>
            ))}
            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(async () => osValue(await osBridge().addFolder(projectId)), '已添加')
                }
              >
                <FolderPlus size={16} />
                添加文件夹
              </Button>
            </div>
          </section>
          <section className="os-form-section" aria-label="项目记忆">
            <h2>项目记忆</h2>
            <p className="os-muted">
              Jarvis 和线程自己记的笔记（一个主题一个文件，带版本校验，每周整理一次）。
            </p>
            {!memory.length && <p className="os-muted">还没有记忆。</p>}
            {memory.map((topic) => (
              <div key={topic.name} className="os-row" data-testid="memory-row">
                <Brain size={16} />
                <span className="os-row-text">
                  <strong>{topic.name}</strong>
                  <span>{topic.description}</span>
                </span>
                <Badge>{TYPE_LABELS[topic.type]}</Badge>
                <span className="os-muted">{relativeTime(topic.updatedAt, Date.now())}</span>
              </div>
            ))}
          </section>
          <div className="os-form-row">
            <Field>
              <FieldLabel>执行方式</FieldLabel>
              <NativeSelect
                value={project.mode === 'plan' ? 'plan' : 'normal'}
                disabled={busy}
                onChange={(e) => void patch({ mode: e.target.value as 'plan' | 'normal' })}
              >
                {MODES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel>每个线程的预算</FieldLabel>
              <NativeSelect
                value={String(project.threadBudget)}
                disabled={busy}
                onChange={(e) => void patch({ threadBudget: Number(e.target.value) })}
              >
                {[...new Set([...BUDGETS, project.threadBudget])].map((value) => (
                  <option key={value} value={value}>
                    {value / 10_000} 万 token，用完先问你
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <section className="os-form-section" aria-label="删除项目">
            <div className="os-row">
              <CircleAlert size={16} />
              <span className="os-row-text">
                <strong>删除项目</strong>
                <span>移除这个项目的对话、线程与记忆；目录里的文件不受影响。</span>
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    if (
                      !(await confirm({
                        title: '删除项目？',
                        message: `删除“${project.title}”后，它的对话、线程和记忆不再显示。`,
                        confirmLabel: '删除项目',
                        tone: 'destructive',
                      }))
                    )
                      return;
                    await run(async () => osValue(await osBridge().removeProject(projectId)), '');
                    onOpen(null, 'Jarvis Chat');
                  })()
                }
              >
                删除项目
              </Button>
            </div>
          </section>
        </form>
      </div>
    </section>
  );
}

const TYPE_LABELS: Record<MemoryTopic['type'], string> = {
  preference: '偏好',
  decision: '决定',
  pitfall: '坑',
  reference: '资源',
  fact: '事实',
};
