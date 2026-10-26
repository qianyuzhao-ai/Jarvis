import { createHash, randomUUID } from 'node:crypto';
import type { WritingCommand, WritingReply, WritingScope } from '../../../shared/writing-agent';
import type { WritingFiles } from '../../writing/files';
import type { TextChange } from '../../../shared/agent-ledger';

export const contentVersion = (content: string) =>
  createHash('sha256').update(content).digest('hex');
/** The end of a slice that does not split a surrogate pair. */
function sliceEnd(content: string, from: number, limit: number) {
  const end = Math.min(content.length, from + limit);
  const code = content.charCodeAt(end - 1);
  return end < content.length && code >= 0xd800 && code <= 0xdbff ? end - 1 : end;
}

/**
 * Answers a thread's writing commands for a document no window has open, on the saved file: it
 * stands in for the editor so the writing tools work the same. Every edit is saved at once and
 * kept as a text change; a round's edits share one transaction and are undone together while
 * the file still holds what they wrote.
 */
export class DiskWriting {
  private rounds = new Map<string, string>();
  private changes = new Map<string, TextChange[]>();
  constructor(private files: WritingFiles) {}
  /** The text changes of a transaction, oldest first. */
  changesOf(transactionId: string) {
    return [...(this.changes.get(transactionId) ?? [])];
  }
  async request(
    _owner: number,
    input: Omit<WritingCommand, 'requestId' | 'expiresAt'>,
    signal?: AbortSignal,
  ): Promise<WritingReply> {
    if (signal?.aborted) throw new Error('操作已停止');
    const { scope, runId, command } = input;
    const reply = { requestId: randomUUID(), runId, scope };
    try {
      const file = await this.files.read(scope.rootId, scope.path);
      const name = scope.path.split('/').at(-1) ?? scope.path;
      const snapshot = (content: string, from: number, limit: number, selection: boolean) => {
        const start = selection ? 0 : Math.min(from, content.length);
        const end = selection ? 0 : sliceEnd(content, start, limit);
        return {
          name,
          version: contentVersion(content),
          length: content.length,
          from: start,
          text: content.slice(start, end),
          next: !selection && end < content.length ? end : null,
          selection: { from: 0, to: 0, text: '', truncated: false },
        };
      };
      if (command.type === 'read')
        return {
          ...reply,
          ok: true,
          snapshot: snapshot(file.content, command.from, command.limit, command.selection),
        };
      if (command.type === 'undo') throw new Error('关闭的文档请用撤销入口撤销');
      const { edit } = command;
      if (contentVersion(file.content) !== edit.version)
        throw new Error('文档版本已变化，请重新读取后修改');
      const [from, to] = edit.kind === 'replace_range' ? [edit.from, edit.to] : [edit.at, edit.at];
      if (from > to || to > file.content.length) throw new Error('修改范围超出文档');
      const after = file.content.slice(0, from) + edit.text + file.content.slice(to);
      const saved = await this.files.save(scope.rootId, scope.path, after, file.revision);
      const transactionId = this.rounds.get(runId) ?? randomUUID();
      this.rounds.set(runId, transactionId);
      const list = this.changes.get(transactionId) ?? [];
      list.push({
        at: from,
        removed: file.content.slice(from, to),
        inserted: edit.text,
        afterVersion: contentVersion(saved.content),
      });
      this.changes.set(transactionId, list);
      return {
        ...reply,
        ok: true,
        transactionId,
        summary: `已修改并保存：${list.length} 处 · ${name}（文档未打开，可撤销）`,
        snapshot: snapshot(saved.content, 0, 1, false),
      };
    } catch (error) {
      return { ...reply, ok: false, error: error instanceof Error ? error.message : '读写失败' };
    }
  }
  /** Puts back what a round wrote, newest first, while the file still holds each edit. */
  async undo(scope: WritingScope, changes: TextChange[]) {
    const file = await this.files.read(scope.rootId, scope.path);
    let content = file.content;
    for (const change of [...changes].reverse()) {
      if (contentVersion(content) !== change.afterVersion)
        throw new Error('文档在这次修改之后又被改过，无法撤销');
      content =
        content.slice(0, change.at) +
        change.removed +
        content.slice(change.at + change.inserted.length);
    }
    await this.files.save(scope.rootId, scope.path, content, file.revision);
  }
  /** Forgets a finished round; its transaction stays undoable through the ledger. */
  endRound(runId: string) {
    const id = this.rounds.get(runId);
    this.rounds.delete(runId);
    if (id) this.changes.delete(id);
  }
}
