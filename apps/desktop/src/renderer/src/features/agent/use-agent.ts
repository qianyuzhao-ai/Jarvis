import { useEffect, useRef, useState, useCallback } from 'react';
import {
  agentValue,
  type AgentSnapshot,
  type AgentEvent,
  type RelayView,
} from '../../../../shared/agent';

export function useAgent() {
  const [snapshot, setSnapshot] = useState<AgentSnapshot>({ sessions: [], busySessionId: null });
  const [configuration, setConfiguration] = useState<RelayView>({ config: null, hasKey: false });
  const [selected, setSelected] = useState<string | null>(() =>
    localStorage.getItem('jarvis:chat-session'),
  );
  const [draftKey, setDraftKey] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const seq = useRef(-1);
  const select = useCallback((id: string | null) => {
    setSelected(id);
    if (id) localStorage.setItem('jarvis:chat-session', id);
    else localStorage.removeItem('jarvis:chat-session');
  }, []);
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
  const session = snapshot.sessions.find((s) => s.id === selected) ?? null;
  async function send(text: string, model?: string) {
    const bridge = window.desktop?.agent;
    if (!bridge || sendingRef.current || snapshot.busySessionId) return false;
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      const id = session?.id ?? agentValue(await bridge.createSession());
      if (!session && model && model !== configuration.config?.model)
        agentValue(await bridge.setModel({ sessionId: id, model }));
      agentValue(await bridge.send({ sessionId: id, requestId: crypto.randomUUID(), text }));
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
  return {
    snapshot,
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
    newChat: () => {
      select(null);
      setDraftKey((v) => v + 1);
      setError('');
    },
  };
}
