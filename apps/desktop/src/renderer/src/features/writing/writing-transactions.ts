import {
  sameWritingScope,
  writingScopeKey,
  type WritingScope,
  type WritingCommand,
  type WritingEdit,
} from '../../../../shared/writing-agent';
export async function bufferVersion(content: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}
export type BufferDocument = WritingScope & { content: string; status: string };
export type WritingTransaction = {
  id: string;
  runId: string;
  scope: WritingScope;
  before: string;
  after: string;
  replaced: number;
  inserted: number;
  startedAt: number;
};
export function textBoundary(content: string, position: number) {
  const before = content.charCodeAt(position - 1),
    after = content.charCodeAt(position);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}
export function textSliceEnd(content: string, from: number, limit: number) {
  if (!textBoundary(content, from)) throw new Error('读取起点不能截断 Unicode 字符');
  let end = Math.min(content.length, from + limit);
  if (!textBoundary(content, end)) {
    end--;
    if (end === from) throw new Error('请增加读取长度以包含完整 Unicode 字符');
  }
  return end;
}
export function editBuffer(content: string, edit: WritingEdit) {
  const from = edit.kind === 'insert_text' ? edit.at : edit.from,
    to = edit.kind === 'insert_text' ? edit.at : edit.to;
  if (from > to || to > content.length) throw new Error('编辑范围超出当前文档');
  if (!textBoundary(content, from) || !textBoundary(content, to))
    throw new Error('编辑范围不能截断 Unicode 字符，请使用返回的选区范围');
  const after = content.slice(0, from) + edit.text + content.slice(to);
  if (after.length > 4 * 1024 * 1024) throw new Error('文档超过编辑上限');
  return { after, from, to };
}
export class WritingTransactions {
  private entries = new Map<string, WritingTransaction[]>();
  latest(scope: WritingScope) {
    return this.entries.get(writingScopeKey(scope))?.at(-1);
  }
  async prepare(doc: BufferDocument, command: WritingCommand) {
    if (!sameWritingScope(doc, command.scope)) throw new Error('文档不属于当前标签');
    if (command.command.type !== 'edit') throw new Error('不是编辑请求');
    if (['conflict', 'error'].includes(doc.status))
      throw new Error('文档存在外部修改或读取冲突，请先处理后重试');
    if (command.expiresAt < Date.now()) throw new Error('写作请求已过期');
    if ((await bufferVersion(doc.content)) !== command.command.edit.version)
      throw new Error('文档版本已变化，请重新读取后修改');
    const edit = command.command.edit,
      { after, from, to } = editBuffer(doc.content, edit);
    const previous = this.latest(doc),
      sameRun = previous?.runId === command.runId;
    if (sameRun && previous.after !== doc.content)
      throw new Error('本轮修改后文档已被手动编辑，请重新发送请求');
    const paragraphs =
      (edit.kind === 'insert_text' ? edit.text : doc.content.slice(from, to))
        .split(/\n\s*\n/)
        .filter((s) => s.trim()).length || 1;
    const transaction: WritingTransaction = {
      id: sameRun ? previous.id : crypto.randomUUID(),
      runId: command.runId,
      scope: command.scope,
      before: sameRun ? previous.before : doc.content,
      after,
      replaced:
        (sameRun ? previous.replaced : 0) + (edit.kind === 'replace_range' ? paragraphs : 0),
      inserted: (sameRun ? previous.inserted : 0) + (edit.kind === 'insert_text' ? paragraphs : 0),
      startedAt: sameRun ? previous.startedAt : Date.now(),
    };
    return { transaction, first: !sameRun, from, to, text: edit.text };
  }
  accept(entry: WritingTransaction) {
    const key = writingScopeKey(entry.scope),
      entries = this.entries.get(key) ?? [];
    if (entries.at(-1)?.id === entry.id) entries[entries.length - 1] = entry;
    else entries.push(entry);
    this.entries.set(key, entries.slice(-20));
  }
  undo(doc: BufferDocument, id: string) {
    const entry = this.latest(doc);
    if (
      !entry ||
      entry.id !== id ||
      entry.after !== doc.content ||
      ['conflict', 'error'].includes(doc.status)
    )
      throw new Error('文档已有后续修改，无法撤销这一轮');
    return entry;
  }
  remove(entry: WritingTransaction) {
    this.entries.get(writingScopeKey(entry.scope))?.pop();
  }
}
