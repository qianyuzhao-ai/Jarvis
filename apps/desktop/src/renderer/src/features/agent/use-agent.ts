import { sameWritingScope, type WritingScope } from '../../../../shared/writing-agent';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  agentValue,
  type AgentSnapshot,
  type AgentEvent,
  type ChatMessage,
  type ChatSession,
  type SessionEvent,
} from '../../../../shared/agent';
import {
  nearestThinkingLevel,
  type ModelSettingsView,
  type ThinkingLevel,
} from '../../../../shared/models';
import type { VisionAsset } from '../../../../shared/canvas-vision';
import type { CanvasSnapshot } from '../../../../shared/canvas-agent';

const EMPTY_MODELS: ModelSettingsView = { providers: [], models: [], defaultModelId: null };
type MessageView = { id: string; seq: number; messages: ChatMessage[] };

/** Applies a session event: changed messages replace theirs, new ones are appended. */
function applyEvent(view: MessageView, event: SessionEvent): MessageView {
  if (event.seq <= view.seq) return view;
  const messages = [...view.messages];
  for (const message of event.messages) {
    const index = messages.findIndex((m) => m.id === message.id);
    if (index >= 0) messages[index] = message;
    else messages.push(message);
  }
  return { ...view, seq: event.seq, messages };
}

export function useAgent(
  projectId?: string,
  initialSelection?: string | null,
  writingScope?: WritingScope,
) {
  const storageKey = writingScope
    ? null
    : projectId
      ? `jarvis:canvas-chat:${projectId}`
      : 'jarvis:chat-session';
  const [snapshot, setSnapshot] = useState<AgentSnapshot>({ sessions: [], runs: {} });
  const [selected, setSelected] = useState<string | null>(() =>
    initialSelection === undefined
      ? storageKey
        ? localStorage.getItem(storageKey)
        : null
      : initialSelection,
  );
  const [draftKey, setDraftKey] = useState(0);
  const [draftThinking, setDraftThinking] = useState<ThinkingLevel>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const seq = useRef(-1);
  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      if (storageKey) {
        if (id) localStorage.setItem(storageKey, id);
        else localStorage.removeItem(storageKey);
      }
    },
    [storageKey],
  );
  useEffect(() => {
    const bridge = window.desktop?.agent;
    if (!bridge) {
      setError('Agent 桥接不可用，请重新打开应用');
      setLoading(false);
      return;
    }
    let active = true;
    const receive = (event: AgentEvent) => {
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
        receive(agentValue(s));
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
  const sessions = snapshot.sessions.filter(
    (s) => s.projectId === projectId && sameWritingScope(s.writingScope, writingScope),
  );
  const meta =
    sessions.find((s) => s.id === selected) ??
    (writingScope && !draftKey
      ? ([...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null)
      : null);
  const sessionId = meta?.id ?? null;
  // Only the open conversation's messages are loaded and kept up to date.
  const [view, setView] = useState<MessageView | null>(null);
  const wanted = useRef<string | null>(null);
  const loaded = useRef<string | null>(null);
  const pending = useRef<SessionEvent[]>([]);
  useEffect(() => {
    const bridge = window.desktop?.agent;
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
    const bridge = window.desktop?.agent;
    if (!sessionId || !bridge) {
      setView(null);
      return;
    }
    let active = true;
    void bridge
      .getSession(sessionId)
      .then((result) => {
        if (!active) return;
        const { seq, session } = agentValue(result);
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
  const session: ChatSession | null = meta
    ? { ...meta, messages: view?.id === meta.id ? view.messages : [] }
    : null;
  async function send(
    text: string,
    model?: string,
    canvas?: CanvasSnapshot,
    images?: VisionAsset[],
  ) {
    const bridge = window.desktop?.agent;
    if (!bridge || sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      if (projectId && canvas?.projectId !== projectId) throw new Error('请选择当前画布上下文');
      const id =
        session?.id ??
        agentValue(
          await (writingScope
            ? bridge.createWritingSession(writingScope)
            : projectId
              ? bridge.createCanvasSession(projectId)
              : bridge.createSession()),
        );
      if (!session && model && model !== configuration.defaultModelId)
        agentValue(await bridge.setModel({ sessionId: id, model }));
      const picked = configuration.models.find(
        (m) => m.id === (model || configuration.defaultModelId),
      );
      if (!session && draftThinking && picked && picked.thinkingLevels.length > 1)
        agentValue(
          await bridge.setThinkingLevel({
            sessionId: id,
            level: nearestThinkingLevel(picked.thinkingLevels, draftThinking),
          }),
        );
      agentValue(
        await bridge.send({
          sessionId: id,
          requestId: crypto.randomUUID(),
          text,
          ...(canvas ? { canvas } : {}),
          ...(writingScope ? { writing: writingScope } : {}),
          ...(images?.length ? { images } : {}),
        }),
      );
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
  async function cancel() {
    if (!session?.runId || !window.desktop?.agent) return;
    try {
      agentValue(await window.desktop.agent.cancel(session.runId));
    } catch (e) {
      setError(e instanceof Error ? e.message : '停止失败');
    }
  }
  async function model(model: string) {
    if (!session || !window.desktop?.agent) return;
    try {
      agentValue(await window.desktop.agent.setModel({ sessionId: session.id, model }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换模型失败');
    }
  }
  async function thinking(level: ThinkingLevel) {
    if (!session) {
      setDraftThinking(level);
      return;
    }
    if (!window.desktop?.agent) return;
    try {
      agentValue(await window.desktop.agent.setThinkingLevel({ sessionId: session.id, level }));
    } catch (e) {
      setError(e instanceof Error ? e.message : '切换思考程度失败');
    }
  }
  /** Undoes one recorded change in this hook's project or document; errors go to `error`. */
  async function undoChange(transactionId: string) {
    if (!window.desktop?.agent) return false;
    try {
      if (projectId) agentValue(await window.desktop.agent.undo({ transactionId, projectId }));
      else if (writingScope)
        agentValue(await window.desktop.agent.undo({ transactionId, writingScope }));
      else return false;
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '撤销失败');
      return false;
    }
  }
  async function rename(title: string) {
    if (!session || !window.desktop?.agent) return;
    try {
      agentValue(await window.desktop.agent.renameSession({ sessionId: session.id, title }));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '重命名失败');
      return false;
    }
  }
  async function renameConversation(id: string, title: string) {
    if (!window.desktop?.agent || !sessions.some((s) => s.id === id)) return false;
    try {
      agentValue(await window.desktop.agent.renameSession({ sessionId: id, title }));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '重命名失败');
      return false;
    }
  }
  async function deleteConversation(id: string) {
    if (!window.desktop?.agent || !sessions.some((s) => s.id === id)) return false;
    try {
      agentValue(await window.desktop.agent.deleteSession(id));
      if (writingScope && session?.id === id) setDraftKey((v) => v + 1);
      setSelected((current) => {
        if (current !== id) return current;
        if (storageKey) localStorage.removeItem(storageKey);
        return null;
      });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除会话失败');
      return false;
    }
  }
  return {
    snapshot: { ...snapshot, sessions },
    projectId,
    writingScope,
    /** Any conversation is replying: settings that affect every conversation wait. */
    anyBusy: Object.keys(snapshot.runs).length > 0,
    /** A conversation of this hook's project or document is replying. */
    scopeBusy: sessions.some((s) => s.id in snapshot.runs),
    /** The open conversation's round waits for a free slot under the concurrency limit. */
    waiting: !!session && snapshot.runs[session.id] === 'waiting',
    busyProjectIds: snapshot.sessions.flatMap((s) =>
      s.projectId && s.id in snapshot.runs ? [s.projectId] : [],
    ),
    configuration,
    configured: !!configuration.defaultModelId,
    session,
    loading,
    error,
    setError,
    sending,
    draftKey,
    draftThinking,
    thinking,
    select,
    send,
    cancel,
    model,
    undoChange,
    rename,
    renameConversation,
    deleteConversation,
    newChat: () => {
      select(null);
      setDraftThinking(undefined);
      setDraftKey((v) => v + 1);
      setError('');
    },
  };
}
