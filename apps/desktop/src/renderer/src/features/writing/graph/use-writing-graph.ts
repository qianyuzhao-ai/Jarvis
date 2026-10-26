import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@jarvis/ui/components/Toast';
import type { WritingGraph, WritingLinkRequest } from '../../../../../shared/writing-graph';
import type { DocumentSession } from '../useWriting';
import type { useSpaceThread } from '../../agent/use-space-thread';

export function useWritingGraph(
  rootId: string | undefined,
  active: DocumentSession | undefined,
  documents: DocumentSession[],
  thread: ReturnType<typeof useSpaceThread>,
) {
  const [graph, setGraph] = useState<WritingGraph | null>(null);
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState<
    {
      rootId: string;
      source: string;
      target: string;
      id: string;
      inserted: string;
      repairOffset?: number;
    }[]
  >([]);
  const rootRef = useRef(rootId);
  rootRef.current = rootId;
  const generation = useRef(0),
    pending = useRef(false);
  // Resonance comes from the active document's thread; searching is one of its rounds.
  const agent = { ...thread, scopeBusy: thread.busy };
  const scopeKey = active?.id ?? '';
  const refresh = useCallback(async () => {
    const api = window.desktop?.writing;
    if (!rootId || !api || rootRef.current !== rootId) return;
    const turn = ++generation.current;
    setLoading(true);
    try {
      const result = await api.graph({ rootId });
      if (!result.ok) throw new Error(result.error);
      if (turn === generation.current) {
        setGraph((old) =>
          JSON.stringify(old) === JSON.stringify(result.value) ? old : result.value,
        );
        setError('');
      }
    } catch (e) {
      if (turn === generation.current) setError(e instanceof Error ? e.message : '星图读取失败');
    } finally {
      if (turn === generation.current) setLoading(false);
    }
  }, [rootId]);
  useEffect(() => {
    setGraph(null);
    setExtra([]);
    void refresh();
    const off = window.desktop?.writing.onGraphChanged((event) => {
      if (event.rootId === rootId) void refresh();
    });
    const poll = setInterval(() => void refresh(), 5000);
    return () => {
      generation.current++;
      off?.();
      clearInterval(poll);
    };
  }, [rootId, refresh]);
  async function undo(id: string) {
    try {
      const result = await window.desktop!.writing.link({ action: 'undo', transactionId: id });
      if (!result.ok) throw new Error(result.error);
      setExtra((items) => items.filter((item) => item.id !== id));
      setConfirmed((items) =>
        Object.fromEntries(Object.entries(items).filter(([, value]) => value !== id)),
      );
      await refresh();
      toast({ title: result.value.saved ? '已撤销关联' : '已撤销关联（未保存）' });
    } catch (e) {
      setError(e instanceof Error ? e.message : '撤销失败');
    }
  }
  async function change(request: WritingLinkRequest) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await window.desktop!.writing.link(request);
      if (!result.ok) throw new Error(result.error);
      const { transactionId, saved, unchanged, inserted } = result.value;
      if (transactionId && request.action !== 'undo') {
        setConfirmed((items) => ({
          ...items,
          [`${request.rootId}:${request.from}:${request.to}`]: transactionId,
        }));
        setExtra((items) => [
          ...items,
          {
            rootId: request.rootId,
            source: request.from,
            target: request.to,
            id: transactionId,
            inserted: inserted ?? '',
            repairOffset: request.action === 'repair' ? request.offset : undefined,
          },
        ]);
      }
      toast({
        title: unchanged ? '已存在这个关联' : saved ? '已建立关联' : '已建立关联（未保存）',
        action: transactionId
          ? { label: '撤销', onClick: () => void undo(transactionId) }
          : undefined,
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '关联失败');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const activities = agent.session?.messages.flatMap((message) => message.activities ?? []) ?? [];
  const latest = activities.filter((activity) => activity.resonance?.length).at(-1);
  const candidates = useMemo(
    () =>
      (latest?.resonance ?? []).filter((item) => !ignored.includes(`${latest?.id}:${item.path}`)),
    [latest, ignored],
  );
  const liveExtra = useMemo(
    () =>
      extra.filter(
        (item) =>
          item.rootId === rootId &&
          documents.some(
            (doc) =>
              doc.rootId === rootId &&
              doc.path === item.source &&
              !!item.inserted &&
              doc.content.includes(item.inserted),
          ),
      ),
    [extra, documents, rootId],
  );
  const visibleGraph = useMemo(
    () =>
      graph
        ? {
            ...graph,
            links: [
              ...graph.links.filter(
                (link) =>
                  !liveExtra.some(
                    (item) => item.source === link.source && item.repairOffset === link.from,
                  ),
              ),
              ...liveExtra
                .filter(
                  (item) =>
                    !graph.links.some(
                      (link) => link.source === item.source && link.target === item.target,
                    ),
                )
                .map((item) => ({
                  source: item.source,
                  target: item.target,
                  reference: item.target,
                  kind: 'wiki' as const,
                  from: 0,
                  to: 0,
                  context: '尚未保存的关联',
                  firstSeen: Date.now(),
                })),
            ],
          }
        : null,
    [graph, liveExtra],
  );
  return {
    graph: visibleGraph,
    error: error || agent.error,
    setError: (value: string) => {
      setError(value);
      if (!value) agent.setError('');
    },
    loading,
    busy,
    refresh,
    candidates,
    confirmed: Object.fromEntries(
      Object.entries(confirmed)
        .filter(([key]) => key.startsWith(scopeKey + ':'))
        .map(([key, value]) => [key.slice(scopeKey.length + 1), value]),
    ),
    undo,
    change,
    ignore: (path: string) => setIgnored((items) => [...items, `${latest?.id}:${path}`]),
    searching: agent.scopeBusy,
    canFind:
      !!active &&
      active.rootId === rootId &&
      active.fileType === 'markdown' &&
      !agent.loading &&
      !agent.scopeBusy,
    find: () =>
      agent.send(
        '从当前文件夹找 3 个底层逻辑相通的旧文档，用 report_result 的 resonance 返回 path 与一句理由。只提出候选，不修改文档。',
      ),
  };
}
export type GraphWorkspace = ReturnType<typeof useWritingGraph>;
