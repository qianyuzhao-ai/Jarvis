import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatSession, ChatSessionMeta } from '../../../../shared/agent';
import type { ResultCard } from '../../../../shared/agent-cards';
import {
  osValue,
  type OsEvent,
  type OsMessage,
  type OsSessionEvent,
  type OsSnapshot,
  type ThreadState,
} from '../../../../shared/agent-os';
import {
  nearestThinkingLevel,
  type ModelSettingsView,
  type ThinkingLevel,
} from '../../../../shared/models';

const EMPTY_MODELS: ModelSettingsView = { providers: [], models: [], defaultModelId: null };
const STORAGE_KEY = 'jarvis:chat-session';
type MessageView = { id: string; seq: number; messages: OsMessage[] };
export type OsChatSession = ChatSession & { messages: OsMessage[] };
/** How a thread shows in the interim home sidebar until the V1.0.0 thread UI lands. */
const CARD_STATUS: Record<ThreadState, ResultCard['status']> = {
  working: 'running',
  idle: 'waiting',
  blocked: 'needs_user',
  review_ready: 'done',
  done: 'done',
  failed: 'failed',
  stopped: 'failed',
};

/** Applies a session event: changed messages replace theirs, new ones are appended. */
function applyEvent(view: MessageView, event: OsSessionEvent): MessageView {
  if (event.seq <= view.seq) return view;
  const messages = [...view.messages];
  for (const message of event.messages) {
    const index = messages.findIndex((m) => m.id === message.id);
    if (index >= 0) messages[index] = message;
    else messages.push(message);
  }
  if (event.order) {
    const position = new Map(event.order.map((id, i) => [id, i]));
    messages.sort((a, b) => (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity));
  }
  return { ...view, seq: event.seq, messages };
}

/**
 * Conversations of the Agent OS as the home page shows them for now: every project's Coordinator
 * is one home conversation, its threads open from the sidebar. The V1.0.0 project and thread UI
 * replaces this once its design is confirmed.
 */
export function useAgent(initialSelection?: string | null) {
  const [snapshot, setSnapshot] = useState<OsSnapshot>({
    projects: [],
    currentProjectId: null,
    threads: [],
    runs: {},
  });
  const [selected, setSelected] = useState<string | null>(() =>
    initialSelection === undefined ? localStorage.getItem(STORAGE_KEY) : initialSelection,
  );
  const [draftKey, setDraftKey] = useState(0);
  const [draftThinking, setDraftThinking] = useState<ThinkingLevel>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const seq = useRef(-1);
  const select = useCallback((id: string | null) => {
    setSelected(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);
  useEffect(() => {
    const bridge = window.desktop?.os;
    if (!bridge) {
      setError('Agent 桥接不可用，请重新打开应用');
      setLoading(false);
      return;
    }
    let active = true;
    const receive = (event: OsEvent) => {
      if (active && event.seq >= seq.current) {
        seq.current = event.seq;
        setSnapshot(event.snapshot);
      }
    };
    const stop = bridge.onEvent(receive);
    void bridge
      .getSnapshot()
      .then((s) => {
        if (!active) return;
        receive(osValue(s));
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (active) {
          setError(e instanceof Error ? e.message : '读取对话失败');
          setLoading(false);
        }
      });
    return () => {
      active = false;
      stop();
    };
  }, []);
  const configuration: ModelSettingsView = snapshot.models ?? EMPTY_MODELS;
  const sessions = useMemo(() => {
    const coordinators: ChatSessionMeta[] = snapshot.projects.map((p) => ({
      id: p.coordinatorId,
      title: p.title,
      model: p.modelId ?? '',
      ...(p.modelId ? { modelId: p.modelId } : {}),
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      runId: p.coordinatorId in snapshot.runs ? p.coordinatorId : null,
      contextTokens: p.contextTokens,
      contextWindow: p.contextWindow,
      ...(p.thinkingLevel ? { thinkingLevel: p.thinkingLevel } : {}),
      agent: { kind: 'main', origin: 'user' },
    }));
    const threads: ChatSessionMeta[] = snapshot.threads.map((t) => ({
      id: t.id,
      title: t.title,
      model: t.modelId ?? '',
      ...(t.modelId ? { modelId: t.modelId } : {}),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      runId: t.id in snapshot.runs ? t.id : null,
      contextTokens: t.contextTokens,
      contextWindow: t.contextWindow,
      ...(t.thinkingLevel ? { thinkingLevel: t.thinkingLevel } : {}),
      agent: {
        kind: 'main',
        origin: 'delegated',
        parentId: snapshot.projects.find((p) => p.id === t.projectId)?.coordinatorId,
      },
      card: {
        status: CARD_STATUS[t.state],
        summary: t.decisions[0]?.question ?? t.card?.summary ?? '',
        artifacts: [],
        source: 'agent',
        updatedAt: t.updatedAt,
      },
    }));
    return { coordinators, threads };
  }, [snapshot]);
  const all = [...sessions.coordinators, ...sessions.threads];
  const meta = all.find((s) => s.id === selected) ?? null;
  const sessionId = meta?.id ?? null;
  // Only the open conversation's messages are loaded and kept up to date.
  const [view, setView] = useState<MessageView | null>(null);
  const wanted = useRef<string | null>(null);
  const loaded = useRef<string | null>(null);
  const pending = useRef<OsSessionEvent[]>([]);
  useEffect(() => {
    const bridge = window.desktop?.os;
    if (!bridge) return;
    return bridge.onSessionEvent((event) => {
      if (event.sessionId !== wanted.current) return;
      if (loaded.current !== event.sessionId) pending.current.push(event);
      else setView((v) => (v?.id === event.sessionId ? applyEvent(v, event) : v));
    });
  }, []);
  useEffect(() => {
    wanted.current = sessionId;
    loaded.current = null;
    pending.current = [];
    const bridge = window.desktop?.os;
    if (!bridge) return;
    void bridge.setViewing(sessionId ? [sessionId] : []);
    if (!sessionId) {
      setView(null);
      return;
    }
    let active = true;
    void bridge
      .getSession(sessionId)
      .then((result) => {
        if (!active) return;
        const { seq, session } = osValue(result);
        const start: MessageView = { id: sessionId, seq, messages: session.messages };
        const next = pending.current.reduce(applyEvent, start);
        pending.current = [];
        loaded.current = sessionId;
        setView(next);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : '读取对话失败');
      });
    return () => {
      active = false;
    };
  }, [sessionId]);
  const session: OsChatSession | null = meta
    ? { ...meta, messages: view?.id === meta.id ? view.messages : [] }
    : null;
  const bridge = () => {
    const os = window.desktop?.os;
    if (!os) throw new Error('Agent 桥接不可用');
    return os;
  };
  async function send(text: string, model?: string) {
    if (sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      const os = bridge();
      let id = session?.id;
      if (!id) {
        // A new home conversation is a new project, unless the current one has no messages yet
        // (for example it was created by adding a folder in settings); its Coordinator answers.
        const title = text.replace(/\s+/g, ' ').slice(0, 36) || '新项目';
        const current = snapshot.projects.find((p) => p.id === snapshot.currentProjectId);
        const empty =
          current &&
          osValue(await os.getSession(current.coordinatorId)).session.messages.length === 0;
        const projectId =
          current && empty
            ? (osValue(await os.updateProject({ id: current.id, patch: { title } })), current.id)
            : osValue(await os.createProject(title));
        const created = osValue(await os.getSnapshot()).snapshot.projects.find(
          (p) => p.id === projectId,
        );
        if (!created) throw new Error('项目创建失败');
        id = created.coordinatorId;
        if (model && model !== configuration.defaultModelId)
          osValue(await os.setModel({ sessionId: id, model }));
        const picked = configuration.models.find(
          (m) => m.id === (model || configuration.defaultModelId),
        );
        if (draftThinking && picked && picked.thinkingLevels.length > 1)
          osValue(
            await os.setThinkingLevel({
              sessionId: id,
              level: nearestThinkingLevel(picked.thinkingLevels, draftThinking),
            }),
          );
      }
      osValue(await os.send({ sessionId: id, requestId: crypto.randomUUID(), text }));
      select(id);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  async function act(action: () => Promise<unknown>, failure: string) {
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : failure);
      return false;
    }
  }
  const projectOf = (id: string) => snapshot.projects.find((p) => p.coordinatorId === id);
  async function rename(id: string, title: string) {
    const project = projectOf(id);
    return act(
      async () =>
        osValue(
          project
            ? await bridge().updateProject({ id: project.id, patch: { title } })
            : await bridge().renameThread({ threadId: id, title }),
        ),
      '重命名失败',
    );
  }
  return {
    snapshot: {
      ...snapshot,
      sessions: all,
      skills: snapshot.skills,
      mcp: snapshot.mcp,
      replyMode: snapshot.replyMode,
    },
    /** Home conversations: one per project. */
    homeSessions: sessions.coordinators,
    /** Any conversation is replying: settings that affect every conversation wait. */
    anyBusy: Object.keys(snapshot.runs).length > 0,
    /** The open conversation's round waits for a free slot under the concurrency limit. */
    waiting: !!session && snapshot.runs[session.id] === 'waiting',
    /** Threads, most recently updated first. */
    cards: [...sessions.threads]
      .filter((t) => !snapshot.threads.find((x) => x.id === t.id)?.resolved)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    busyProjectIds: [] as string[],
    configuration,
    configured: !!configuration.defaultModelId,
    session,
    loading,
    error,
    setError,
    sending,
    draftKey,
    draftThinking,
    select,
    send,
    cancel: () =>
      act(async () => session && osValue(await bridge().cancel(session.id)), '停止失败'),
    model: (model: string) =>
      act(
        async () => session && osValue(await bridge().setModel({ sessionId: session.id, model })),
        '切换模型失败',
      ),
    thinking: async (level: ThinkingLevel) => {
      if (!session) return setDraftThinking(level);
      await act(
        async () => osValue(await bridge().setThinkingLevel({ sessionId: session.id, level })),
        '切换思考程度失败',
      );
    },
    undoChange: (transactionId: string) =>
      act(async () => osValue(await bridge().undo(transactionId)), '撤销失败'),
    rename: (title: string) => (session ? rename(session.id, title) : Promise.resolve(false)),
    renameConversation: rename,
    deleteConversation: (id: string) => {
      const project = projectOf(id);
      if (!project) return Promise.resolve(false);
      return act(async () => {
        osValue(await bridge().removeProject(project.id));
        if (selected === id) select(null);
      }, '删除失败');
    },
    newChat: () => {
      select(null);
      setDraftThinking(undefined);
      setDraftKey((v) => v + 1);
      setError('');
    },
  };
}
