import { createHash, randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import type { WritingLinkRequest, WritingLinkReceipt } from '../../shared/writing-graph';
import type { WritingScope } from '../../shared/writing-agent';
import type { Ledger } from '../agent/kernel/ledger';
import type { WritingBroker } from '../agent/writing-broker';
import type { WritingFiles } from './files';
import type { GraphIndex } from './graph-index';
import { markdownMetadata, resolveReference, associationOffset } from './graph-markdown';

export const LINK_LEDGER_SESSION = '00000000-0000-4000-8000-000000000005';
const version = (content: string) => createHash('sha256').update(content).digest('hex');
export class GraphLinks {
  constructor(
    private files: WritingFiles,
    private graph: GraphIndex,
    private broker: WritingBroker,
    private ledger: Ledger,
    private owner: (scope: WritingScope) => number | undefined,
  ) {}
  private async read(scope: WritingScope) {
    const owner = this.owner(scope);
    if (owner === undefined) {
      const file = await this.files.read(scope.rootId, scope.path);
      return { content: file.content, revision: file.revision, owner };
    }
    let content = '',
      from = 0,
      expected = '';
    do {
      const reply = await this.broker.request(owner, {
        runId: randomUUID(),
        scope,
        command: { type: 'read', selection: false, from, limit: 32000 },
      });
      if (!reply.ok || !reply.snapshot) throw new Error(reply.error || '读取缓冲区失败');
      const snapshot = reply.snapshot;
      if (expected && expected !== snapshot.version) throw new Error('文档已被修改，请重试');
      expected = snapshot.version;
      content += snapshot.text;
      if (snapshot.next === null) break;
      if (snapshot.next <= from || content.length > 4 * 1024 * 1024)
        throw new Error('文档读取范围不正确');
      from = snapshot.next;
    } while (from <= 4 * 1024 * 1024);
    return { content, revision: expected, owner };
  }
  private async apply(
    scope: WritingScope,
    current: Awaited<ReturnType<GraphLinks['read']>>,
    at: number,
    removed: string,
    inserted: string,
  ) {
    if (this.owner(scope) !== current.owner) throw new Error('文档打开状态已变化，请重试');
    const content =
      current.content.slice(0, at) + inserted + current.content.slice(at + removed.length);
    if (current.owner === undefined)
      await this.files.save(scope.rootId, scope.path, content, current.revision);
    else {
      const reply = await this.broker.request(current.owner, {
        runId: randomUUID(),
        scope,
        command: {
          type: 'edit',
          edit: {
            kind: 'replace_range',
            from: at,
            to: at + removed.length,
            text: inserted,
            version: current.revision,
          },
        },
      });
      if (!reply.ok) throw new Error(reply.error || '更新缓冲区失败');
    }
    return { saved: current.owner === undefined, afterVersion: version(content) };
  }
  async execute(request: WritingLinkRequest): Promise<WritingLinkReceipt> {
    if (request.action === 'undo') {
      const entry = this.ledger.find(request.transactionId);
      if (
        !entry ||
        entry.pack !== 'writing-link' ||
        !entry.writingScope ||
        !entry.linkChange ||
        entry.status !== 'applied'
      )
        throw new Error('关联记录不存在或已撤销');
      const current = await this.read(entry.writingScope);
      const patch = entry.linkChange;
      if (version(current.content) !== patch.afterVersion) throw new Error('文档已被修改，未撤销');
      const result = await this.apply(
        entry.writingScope,
        current,
        patch.at,
        patch.inserted,
        patch.removed,
      );
      this.ledger.markUndone(entry.id);
      await this.ledger.settled();
      return { transactionId: entry.id, saved: result.saved };
    }
    if (request.from === request.to) throw new Error('不能关联文档自身');
    const graph = await this.graph.graph(request.rootId);
    const source = graph.dots.find((d) => d.path === request.from);
    const target = graph.dots.find((d) => d.path === request.to);
    if (source?.fileType !== 'markdown' || !target)
      throw new Error('来源必须是 Markdown，目标必须在当前授权文件夹内');
    const scope = { rootId: request.rootId, path: request.from };
    const current = await this.read(scope);
    const refs = markdownMetadata(current.content).refs;
    let at = current.content.length,
      removed = '',
      inserted = '';
    const reference = posix
      .relative(posix.dirname(request.from), request.to)
      .replace(/\.(md|markdown)$/i, '');
    if (/[[\]|\r\n]/.test(reference)) throw new Error('目标名称不支持双链，请先改名');
    if (request.action === 'repair') {
      const old = refs.find(
        (r) =>
          r.reference === request.reference &&
          r.from === request.offset &&
          !resolveReference(graph.dots, request.from, r.reference, r.kind),
      );
      if (!old) throw new Error('失效链接已变化，请刷新后重试');
      at = old.from;
      removed = current.content.slice(old.from, old.to);
      inserted =
        old.kind === 'wiki'
          ? `[[${reference}${/^\[\[[^|\]]+(\|[^\]]+)?\]\]$/.exec(removed)?.[1] ?? ''}]]`
          : `${removed.startsWith('!') ? '!' : ''}[${/^!?\[([^\]]*)\]/.exec(removed)?.[1] ?? target.title}](${encodeURI(
              posix.relative(posix.dirname(request.from), request.to),
            )
              .replaceAll('(', '%28')
              .replaceAll(')', '%29')})`;
    } else {
      if (
        refs.some(
          (r) => resolveReference(graph.dots, request.from, r.reference, r.kind) === request.to,
        )
      )
        return { unchanged: true, saved: current.owner === undefined };
      const section = associationOffset(current.content);
      if (section !== null) {
        at = section;
        inserted =
          (at && current.content[at - 1] !== '\n' ? '\n' : '') +
          `- [[${reference}]]\n` +
          (at < current.content.length ? '\n' : '');
      } else
        inserted =
          (!current.content || current.content.endsWith('\n\n')
            ? ''
            : current.content.endsWith('\n')
              ? '\n'
              : '\n\n') + `## 关联\n\n- [[${reference}]]\n`;
    }
    const result = await this.apply(scope, current, at, removed, inserted);
    const id = randomUUID();
    this.ledger.record({
      id,
      sessionId: LINK_LEDGER_SESSION,
      runId: randomUUID(),
      pack: 'writing-link',
      writingScope: scope,
      summary: `关联 ${request.from} → ${request.to}`,
      afterRevision: result.afterVersion,
      linkChange: { at, removed, inserted, afterVersion: result.afterVersion },
    });
    await this.ledger.settled();
    return { transactionId: id, saved: result.saved, inserted };
  }
}
