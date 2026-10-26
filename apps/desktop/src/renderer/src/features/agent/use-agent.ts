import { useEffect, useRef, useState } from 'react';
import type { ChatSession } from '../../../../shared/agent';
import {
  osValue,
  type OsEvent,
  type OsMessage,
  type OsSessionEvent,
  type OsSnapshot,
} from '../../../../shared/agent-os';
import {
  nearestThinkingLevel,
  type ModelSettingsView,
  type ThinkingLevel,
} from '../../../../shared/models';

const EMPTY_MODELS: ModelSettingsView = { providers: [], models: [], defaultModelId: null };
const EMPTY: OsSnapshot = { projects: [], currentProjectId: null, threads: [], runs: {} };
type MessageView = { id: string; seq: number; messages: OsMessage[] };
export type OsChatSession = Omit<ChatSession, 'messages'> & {
  kind: 'coordinator' | 'thread';
  projectId: string;
  messages: OsMessage[];
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

export function osBridge() {
  const os = window.desktop?.os;
  if (!os) throw new Error('Agent 桥接不可用，请重新打开应用');
  return os;
}

/** The Agent OS snapshot: projects, threads, decisions, runs and shared settings. */
export function useOsSnapshot() {
  const [snapshot, setSnapshot] = useState<OsSnapshot>(EMPTY);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const seq = useRef(-1);
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
  return {
    snapshot,
    loading,
    error,
    setError,
    configuration,
    configured: !!configuration.defaultModelId,
    current: snapshot.projects.find((p) => p.id === snapshot.currentProjectId) ?? null,
    /** Any round is in flight: settings that affect every conversation wait. */
    anyBusy: Object.keys(snapshot.runs).length > 0,
  };
}

/**
 * One conversation of the Agent OS: a project's Coordinator or a thread. With no session yet,
 * the first message starts a project (or fills the current one if it has no messages) and
 * `onCreated` receives its Coordinator.
 */
export function useAgent(sessionId: string | null, onCreated?: (id: string) => void) {
  const os = useOsSnapshot();
  const { snapshot, configuration, setError } = os;
  const [draftThinking, setDraftThinking] = useState<ThinkingLevel>();
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const project = snapshot.projects.find((p) => p.coordinatorId === sessionId);
  const thread = snapshot.threads.find((t) => t.id === sessionId);
  const owner = project ?? snapshot.projects.find((p) => p.id === thread?.projectId);
  const own = project ?? thread;
  const known = !!own && !!owner;
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
  const target = known ? sessionId : null;
  useEffect(() => {
    wanted.current = target;
    loaded.current = null;
    pending.current = [];
    const bridge = window.desktop?.os;
    if (!bridge) return;
    if (!target) {
      setView(null);
      return;
    }
    let active = true;
    void bridge
      .getSession(target)
      .then((result) => {
        if (!active) return;
        const { seq, session } = osValue(result);
        const start: MessageView = { id: target, seq, messages: session.messages };
        const next = pending.current.reduce(applyEvent, start);
        pending.current = [];
        loaded.current = target;
        setView(next);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : '读取对话失败');
      });
    return () => {
      active = false;
    };
  }, [target, setError]);
  const session: OsChatSession | null =
    own && owner && sessionId
      ? {
          id: sessionId,
          kind: project ? 'coordinator' : 'thread',
          projectId: owner.id,
          title: own.title,
          model: own.modelId ?? '',
          modelId: own.modelId ?? owner.modelId,
          thinkingLevel: own.thinkingLevel,
          createdAt: own.createdAt,
          updatedAt: own.updatedAt,
          runId: sessionId in snapshot.runs ? sessionId : null,
          contextTokens: own.contextTokens,
          contextWindow: own.contextWindow,
          agent: { kind: 'main', origin: project ? 'user' : 'delegated' },
          messages: view?.id === sessionId ? view.messages : [],
        }
      : null;
  async function act(action: () => Promise<unknown>, failure: string) {
    try {
      await action();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : failure);
      return false;
    }
  }
  async function send(text: string, model?: string) {
    if (sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      const bridge = osBridge();
      let id = session?.id;
      const title = text.replace(/\s+/g, ' ').slice(0, 36) || '新项目';
      // A project made from the menu takes its name from its first message.
      if (
        session?.kind === 'coordinator' &&
        !session.messages.length &&
        project?.title === '新项目'
      )
        osValue(await bridge.updateProject({ id: project.id, patch: { title } }));
      if (!id) {
        // The first message starts a project, or fills the current one while it is still empty.
        const current = os.current;
        const empty =
          current &&
          osValue(await bridge.getSession(current.coordinatorId)).session.messages.length === 0;
        const projectId =
          current && empty
            ? (osValue(await bridge.updateProject({ id: current.id, patch: { title } })),
              current.id)
            : osValue(await bridge.createProject(title));
        const created = osValue(await bridge.getSnapshot()).snapshot.projects.find(
          (p) => p.id === projectId,
        );
        if (!created) throw new Error('项目创建失败');
        id = created.coordinatorId;
        if (model && model !== configuration.defaultModelId)
          osValue(await bridge.setModel({ sessionId: id, model }));
        const picked = configuration.models.find(
          (m) => m.id === (model || configuration.defaultModelId),
        );
        if (draftThinking && picked && picked.thinkingLevels.length > 1)
          osValue(
            await bridge.setThinkingLevel({
              sessionId: id,
              level: nearestThinkingLevel(picked.thinkingLevels, draftThinking),
            }),
          );
      }
      osValue(await bridge.send({ sessionId: id, requestId: crypto.randomUUID(), text }));
      if (!session) onCreated?.(id);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '发送失败');
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  return {
    ...os,
    snapshot: { ...snapshot, skills: snapshot.skills, mcp: snapshot.mcp },
    session,
    thread: thread ?? null,
    project: owner ?? null,
    /** The open conversation's round waits for a free slot under the concurrency limit. */
    waiting: !!session && snapshot.runs[session.id] === 'waiting',
    sending,
    draftThinking,
    send,
    cancel: () =>
      act(async () => session && osValue(await osBridge().cancel(session.id)), '停止失败'),
    model: (model: string) =>
      act(
        async () => session && osValue(await osBridge().setModel({ sessionId: session.id, model })),
        '切换模型失败',
      ),
    thinking: async (level: ThinkingLevel) => {
      if (!session) return setDraftThinking(level);
      await act(
        async () => osValue(await osBridge().setThinkingLevel({ sessionId: session.id, level })),
        '切换思考程度失败',
      );
    },
    act,
  };
}
