import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { EditorState, TransactionSpec } from '@codemirror/state';
import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { agentValue } from '../../../../shared/agent';
import {
  writingCommandSchema,
  sameWritingScope,
  type WritingScope,
  type WritingCommand,
  type WritingReply,
} from '../../../../shared/writing-agent';
import { bufferVersion, textSliceEnd, WritingTransactions } from './writing-transactions';
import { agentHistoryAnnotations, finishWritingAgent, lastAgentRun } from './writing-history';
import type { useWriting } from './useWriting';
export function useWritingHost(
  writing: ReturnType<typeof useWriting>,
  view: MutableRefObject<EditorView | null>,
  cache: MutableRefObject<Map<string, { state: EditorState; scroll: number }>>,
) {
  const transactions = useRef(new WritingTransactions());
  const [, refresh] = useState(0);
  const latest = useRef(writing);
  latest.current = writing;
  const find = useCallback((scope: WritingScope) => {
    const w = latest.current;
    if (w.root?.id !== scope.rootId) throw new Error('文档不在当前打开的文件夹中');
    const d = w.getDocuments().find((d) => sameWritingScope(d, scope));
    if (!d) throw new Error('文档已关闭');
    if (['conflict', 'error'].includes(d.status))
      throw new Error('文档存在外部修改或读取冲突，请先处理');
    return d;
  }, []);
  const stateFor = useCallback(
    (id: string) =>
      latest.current.activeId === id && view.current
        ? view.current.state
        : cache.current.get(id)?.state,
    [view, cache],
  );
  const snapshot = useCallback(
    async (scope: WritingScope, from = 0, limit = 16000, selectionOnly = false) => {
      const doc = find(scope),
        state = stateFor(doc.id),
        range = state?.selection.main ?? { from: 0, to: 0 };
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
        selection: {
          from: range.from,
          to: range.to,
          text: doc.content.slice(range.from, selectionEnd),
          truncated: selectionEnd < range.to,
        },
      };
    },
    [find, stateFor],
  );
  const changeBuffer = useCallback(
    (id: string, content: string, annotations: TransactionSpec['annotations']) => {
      const w = latest.current,
        doc = w.getDocuments().find((d) => d.id === id);
      if (!doc) throw new Error('文档已关闭');
      const state = stateFor(id);
      if (!state || state.doc.toString() !== doc.content)
        throw new Error('编辑器尚未就绪或正在同步，请重新打开文档');
      // Only this document's state is dispatched; inactive documents keep their cached history.
      const tr = state.update({
        changes: { from: 0, to: state.doc.length, insert: content },
        annotations,
      });
      w.change(id, content, true);
      if (w.activeId === id && view.current) view.current.dispatch(tr);
      else {
        const saved = cache.current.get(id);
        cache.current.set(id, { state: tr.state, scroll: saved?.scroll ?? 0 });
      }
      refresh((n) => n + 1);
    },
    [stateFor, view, cache],
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
          changeBuffer(doc.id, entry.before, [
            isolateHistory.of('full'),
            Transaction.userEvent.of('undo.agent'),
          ]);
          transactions.current.remove(entry);
        } else {
          const edit = await transactions.current.prepare(doc, command);
          if (
            !mounted ||
            find(command.scope).content !== doc.content ||
            command.expiresAt < Date.now()
          )
            throw new Error('文档版本已变化，请重新读取后修改');
          changeBuffer(doc.id, edit.transaction.after, [
            ...agentHistoryAnnotations(command.runId, edit.transaction.startedAt),
            ...(edit.first ? [isolateHistory.of('before')] : []),
          ]);
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
      for (const doc of latest.current.getDocuments()) {
        const state = stateFor(doc.id),
          run = state?.field(lastAgentRun, false);
        if (
          !state ||
          !run ||
          snapshot.sessions.some((s) => sameWritingScope(s.writingScope, doc) && s.runId === run)
        )
          continue;
        const tr = state.update({
          effects: finishWritingAgent.of(null),
          annotations: isolateHistory.of('after'),
        });
        if (latest.current.activeId === doc.id && view.current) view.current.dispatch(tr);
        else {
          const saved = cache.current.get(doc.id);
          cache.current.set(doc.id, { state: tr.state, scroll: saved?.scroll ?? 0 });
        }
      }
    });
    return () => {
      mounted = false;
      off();
      offEvents();
    };
  }, [find, snapshot, changeBuffer, stateFor, view, cache]);
  const canUndo = (scope: WritingScope, id: string) => {
    const doc = latest.current.getDocuments().find((d) => sameWritingScope(d, scope)),
      entry = transactions.current.latest(scope);
    return (
      !!doc &&
      doc.rootId === latest.current.root?.id &&
      entry?.id === id &&
      entry.after === doc.content &&
      !['conflict', 'error'].includes(doc.status)
    );
  };
  return { snapshot, canUndo };
}
