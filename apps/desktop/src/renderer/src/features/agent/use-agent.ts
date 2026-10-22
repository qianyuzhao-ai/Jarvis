import { useEffect, useRef, useState, useCallback } from 'react';
import {
  agentValue,
  type AgentSnapshot,
  type AgentEvent,
  type RelayView,
} from '../../../../shared/agent';
import type { VisionAsset } from '../../../../shared/canvas-vision';
import type { CanvasSnapshot } from '../../../../shared/canvas-agent';

export function useAgent(projectId?: string) {
  const storageKey = projectId ? `jarvis:canvas-chat:${projectId}` : 'jarvis:chat-session';
  const [snapshot, setSnapshot] = useState<AgentSnapshot>({ sessions: [], busySessionId: null });
  const [configuration, setConfiguration] = useState<RelayView>({ config: null, hasKey: false });
  const [selected, setSelected] = useState<string | null>(() => localStorage.getItem(storageKey));
  const [draftKey, setDraftKey] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const seq = useRef(-1);
  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      if (id) localStorage.setItem(storageKey, id);
      else localStorage.removeItem(storageKey);
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
    void Promise.all([bridge.getSnapshot(), bridge.getConfiguration()])
      .then(([s, c]) => {
        if (!active) return;
        receive(agentValue(s));
        setConfiguration(agentValue(c));
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
  const sessions = snapshot.sessions.filter((s) => s.projectId === projectId);
  const session = sessions.find((s) => s.id === selected) ?? null;
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
      const chosen =
        configuration.models?.find((entry) => entry.id === (session?.modelId ?? model))?.config ??
        configuration.config;
      if (images?.length && chosen?.provider === 'deepseek' && chosen.model === 'deepseek-v4-pro')
        throw new Error('DeepSeek Pro 不支持图片，请切换到 Flash');
      const id =
        session?.id ??
        agentValue(
          await (projectId ? bridge.createCanvasSession(projectId) : bridge.createSession()),
        );
      if (!session && model && model !== configuration.config?.model)
        agentValue(await bridge.setModel({ sessionId: id, model }));
      agentValue(
        await bridge.send({
          sessionId: id,
          requestId: crypto.randomUUID(),
          text,
          ...(canvas ? { canvas } : {}),
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
      setSelected((current) => {
        if (current !== id) return current;
        localStorage.removeItem(storageKey);
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
    busyProjectId: snapshot.sessions.find((s) => s.id === snapshot.busySessionId)?.projectId,
    configuration,
    setConfiguration,
    session,
    loading,
    error,
    setError,
    sending,
    draftKey,
    select,
    send,
    cancel,
    model,
    rename,
    renameConversation,
    deleteConversation,
    newChat: () => {
      select(null);
      setDraftKey((v) => v + 1);
      setError('');
    },
  };
}
