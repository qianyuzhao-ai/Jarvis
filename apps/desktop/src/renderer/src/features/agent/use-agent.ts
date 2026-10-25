import { sameWritingScope, type WritingScope } from '../../../../shared/writing-agent';
import { useEffect, useRef, useState, useCallback } from 'react';
import { agentValue, type AgentSnapshot, type AgentEvent } from '../../../../shared/agent';
import {
  nearestThinkingLevel,
  type ModelSettingsView,
  type ThinkingLevel,
} from '../../../../shared/models';
import type { VisionAsset } from '../../../../shared/canvas-vision';
import type { CanvasSnapshot } from '../../../../shared/canvas-agent';

const EMPTY_MODELS: ModelSettingsView = { providers: [], models: [], defaultModelId: null };

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
  const [snapshot, setSnapshot] = useState<AgentSnapshot>({ sessions: [], busySessionId: null });
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
  const session =
    sessions.find((s) => s.id === selected) ??
    (writingScope && !draftKey
      ? ([...sessions].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null)
      : null);
  async function send(
    text: string,
    model?: string,
    canvas?: CanvasSnapshot,
    images?: VisionAsset[],
  ) {
    const bridge = window.desktop?.agent;
    if (!bridge || sendingRef.current || snapshot.busySessionId) return false;
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
    busyProjectId: snapshot.sessions.find((s) => s.id === snapshot.busySessionId)?.projectId,
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
