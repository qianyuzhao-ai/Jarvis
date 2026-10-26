import { blockContext } from './editor/markdown/block-context';
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  clearViewCache,
  type BufferView,
  type ViewCache,
  type ExternalEdit,
} from './editor/buffer-view';
import { agentValue } from '../../../../shared/agent';
import {
  writingCommandSchema,
  sameWritingScope,
  type WritingScope,
  type WritingCommand,
  type WritingReply,
} from '../../../../shared/writing-agent';
import { bufferVersion, textSliceEnd, WritingTransactions } from './writing-transactions';
import type { useWriting } from './useWriting';
import { setOpenDocuments } from '../agent/open-targets';
export function useWritingHost(
  writing: ReturnType<typeof useWriting>,
  view: MutableRefObject<BufferView | null>,
  cache: MutableRefObject<ViewCache>,
) {
  const transactions = useRef(new WritingTransactions());
  const [, refresh] = useState(0);
  const latest = useRef(writing);
  latest.current = writing;
  // Documents of the open folder are delegation targets while this space is mounted.
  const openKey = JSON.stringify(
    writing.documents
      .filter((d) => !d.fileType || ['markdown', 'text'].includes(d.fileType))
      .map((d) => ({ rootId: d.rootId, path: d.path, name: d.path.split('/').at(-1) ?? d.path })),
  );
  useEffect(() => {
    setOpenDocuments(JSON.parse(openKey));
    return () => setOpenDocuments([]);
  }, [openKey]);
  useEffect(
    () =>
      window.desktop?.writing.onRenamed(({ rootId, from, to }) => {
        transactions.current.rename(rootId, from, to);
        for (const values of [
          cache.current.source,
          cache.current.blocks,
          cache.current.selections,
          cache.current.generations,
        ]) {
          for (const key of [...values.keys()]) {
            const prefix = rootId + ':' + from;
            if (key === prefix || key.startsWith(prefix + '/')) values.delete(key);
          }
        }
      }),
    [cache],
  );
  const find = useCallback((scope: WritingScope) => {
    const w = latest.current;
    const d = w.getDocuments().find((d) => sameWritingScope(d, scope));
    if (!d) throw new Error('文档已关闭');
    if (['conflict', 'error'].includes(d.status))
      throw new Error('文档存在外部修改或读取冲突，请先处理');
    return d;
  }, []);
  const snapshot = useCallback(
    async (scope: WritingScope, from = 0, limit = 16000, selectionOnly = false) => {
      const doc = find(scope),
        range =
          view.current?.id === doc.id
            ? view.current.getSelection()
            : (cache.current.selections.get(doc.id) ?? { from: 0, to: 0 });
      const start = selectionOnly ? range.from : Math.min(from, doc.content.length),
        end = selectionOnly
          ? textSliceEnd(doc.content, start, Math.min(range.to - start, limit))
          : textSliceEnd(doc.content, start, limit);
      const selectionEnd = textSliceEnd(
        doc.content,
        range.from,
        Math.min(range.to - range.from, 32000),
      );
      return {
        name: doc.path.split('/').at(-1) ?? doc.path,
        version: await bufferVersion(doc.content),
        length: doc.content.length,
        from: start,
        text: doc.content.slice(start, end),
        next: !selectionOnly && end < doc.content.length ? end : null,
        block: blockContext(doc.content, range.from),
        selection: {
          from: range.from,
          to: range.to,
          text: doc.content.slice(range.from, selectionEnd),
          truncated: selectionEnd < range.to,
        },
      };
    },
    [find, view, cache],
  );
  const changeBuffer = useCallback(
    (id: string, content: string, meta: ExternalEdit) => {
      const w = latest.current,
        doc = w.getDocuments().find((d) => d.id === id);
      if (!doc) throw new Error('文档已关闭');
      if (view.current?.id === id) {
        if (view.current.content() !== doc.content) throw new Error('编辑器正在同步，请重试');
        view.current.applyExternal(content, meta);
      } else clearViewCache(cache.current, id);
      w.change(id, content, true);
      refresh((n) => n + 1);
    },
    [view, cache],
  );
  useEffect(() => {
    const bridge = window.desktop?.agent;
    if (!bridge) return;
    const connected = bridge;
    let mounted = true,
      queue = Promise.resolve();
    async function receive(raw: WritingCommand) {
      const command = writingCommandSchema.parse(raw);
      if (!mounted || command.expiresAt < Date.now()) return;
      if (!agentValue(await connected.claimWritingCommand(command.requestId))) return;
      const reply: WritingReply = {
        requestId: command.requestId,
        runId: command.runId,
        scope: command.scope,
        ok: false,
      };
      try {
        const doc = find(command.scope);
        if (command.command.type === 'read')
          reply.snapshot = await snapshot(
            command.scope,
            command.command.from,
            command.command.limit,
            command.command.selection,
          );
        else if (command.command.type === 'undo') {
          const entry = transactions.current.undo(doc, command.command.transactionId);
          changeBuffer(doc.id, entry.before, { undo: true });
          transactions.current.remove(entry);
        } else {
          const edit = await transactions.current.prepare(doc, command);
          if (
            !mounted ||
            find(command.scope).content !== doc.content ||
            command.expiresAt < Date.now()
          )
            throw new Error('文档版本已变化，请重新读取后修改');
          changeBuffer(doc.id, edit.transaction.after, {
            runId: command.runId,
            startedAt: edit.transaction.startedAt,
            first: edit.first,
          });
          transactions.current.accept(edit.transaction);
          reply.transactionId = edit.transaction.id;
          reply.summary = `已修改：${edit.transaction.replaced ? `替换 ${edit.transaction.replaced} 段` : ''}${edit.transaction.inserted ? ` 插入 ${edit.transaction.inserted} 段` : ''} · ${doc.path.split('/').at(-1)}（未保存）`;
          reply.snapshot = {
            ...(await snapshot(command.scope)),
            version: await bufferVersion(edit.transaction.after),
          };
        }
        reply.ok = true;
      } catch (error) {
        reply.error = error instanceof Error ? error.message.slice(0, 1000) : '写作操作失败';
      }
      agentValue(await connected.completeWritingCommand(reply));
    }
    const off = bridge.onWritingCommand((command) => {
      queue = queue
        .then(() => receive(command))
        .catch((error) =>
          latest.current.setNotice(error instanceof Error ? error.message : '写作回执失败'),
        );
    });
    const offEvents = bridge.onEvent(({ snapshot }) => {
      const current = view.current,
        run = current?.agentRun();
      const doc = latest.current.getDocuments().find((d) => d.id === current?.id);
      if (
        current &&
        run &&
        doc &&
        !snapshot.sessions.some((s) => sameWritingScope(s.writingScope, doc) && s.runId === run)
      )
        current.finishAgent();
    });
    return () => {
      mounted = false;
      off();
      offEvents();
    };
  }, [find, snapshot, changeBuffer, view]);
  const canUndo = (scope: WritingScope, id: string) => {
    const doc = latest.current.getDocuments().find((d) => sameWritingScope(d, scope)),
      entry = transactions.current.latest(scope);
    return (
      !!doc &&
      entry?.id === id &&
      entry.after === doc.content &&
      !['conflict', 'error'].includes(doc.status)
    );
  };
  return { snapshot, canUndo };
}
