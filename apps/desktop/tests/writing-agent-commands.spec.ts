import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { EditorState } from '@codemirror/state';
import { undo, isolateHistory } from '@codemirror/commands';
import {
  WritingTransactions,
  bufferVersion,
  editBuffer,
  textSliceEnd,
} from '../src/renderer/src/features/writing/writing-transactions';
import {
  writingHistory,
  agentHistoryAnnotations,
} from '../src/renderer/src/features/writing/writing-history';
import { WritingBroker } from '../src/main/agent/writing-broker';
import { writingPack } from '../src/main/agent/packs/writing';
import type { WritingCommand } from '../src/shared/writing-agent';
import type { ChatMessage } from '../src/shared/agent';
const scope = { rootId: 'approved-root', path: 'article.md' };
test('writing transactions reject stale versions, wrong documents and conflicts; one round has one undo', async () => {
  const tx = new WritingTransactions();
  let doc = { ...scope, content: '第一段\n\n第二段', status: 'saved' };
  const before = doc.content,
    runId = randomUUID();
  const command: WritingCommand = {
    requestId: randomUUID(),
    runId,
    scope,
    expiresAt: Date.now() + 10000,
    command: {
      type: 'edit',
      edit: {
        kind: 'replace_range',
        from: 0,
        to: 3,
        text: '改写段落',
        version: await bufferVersion(doc.content),
      },
    },
  };
  await expect(tx.prepare({ ...doc, path: 'other.md' }, command)).rejects.toThrow('当前标签');
  await expect(tx.prepare({ ...doc, content: '人工改动' }, command)).rejects.toThrow('版本');
  await expect(tx.prepare({ ...doc, status: 'conflict' }, command)).rejects.toThrow('冲突');
  let state = EditorState.create({ doc: doc.content, extensions: writingHistory });
  const first = await tx.prepare(doc, command);
  doc = { ...doc, content: first.transaction.after };
  tx.accept(first.transaction);
  state = state.update({
    changes: { from: 0, to: state.doc.length, insert: doc.content },
    annotations: [
      ...agentHistoryAnnotations(runId, first.transaction.startedAt),
      isolateHistory.of('before'),
    ],
  }).state;
  state = state.update({ selection: { anchor: 1 } }).state;
  const second = await tx.prepare(doc, {
    ...command,
    command: {
      type: 'edit',
      edit: {
        kind: 'insert_text',
        at: doc.content.length,
        text: '\n\n续写',
        version: await bufferVersion(doc.content),
      },
    },
  });
  doc = { ...doc, content: second.transaction.after };
  tx.accept(second.transaction);
  state = state.update({
    changes: { from: 0, to: state.doc.length, insert: doc.content },
    annotations: agentHistoryAnnotations(runId, second.transaction.startedAt),
  }).state;
  expect(first.transaction.id).toBe(second.transaction.id);
  expect(tx.undo(doc, second.transaction.id).before).toBe(before);
  expect(() => tx.undo({ ...doc, content: '人工输入' }, second.transaction.id)).toThrow('后续修改');
  expect(
    undo({
      state,
      dispatch: (tr) => {
        state = tr.state;
      },
    }),
  ).toBe(true);
  expect(state.doc.toString()).toBe(before);
  await expect(tx.prepare(doc, { ...command, expiresAt: 0 })).rejects.toThrow('过期');
});
test('writing broker binds owner, run, scope and expiry, and tools expose no file operations', async () => {
  const broker = new WritingBroker(50);
  let command: WritingCommand | undefined;
  broker.dispatch = (_owner, c) => {
    command = c;
  };
  const pending = broker.request(1, {
    runId: randomUUID(),
    scope,
    command: { type: 'read', selection: false, from: 0, limit: 10 },
  });
  if (!command) throw new Error('Missing command');
  const request = command;
  expect(broker.claim(2, request.requestId)).toBe(false);
  expect(broker.claim(1, request.requestId)).toBe(true);
  expect(broker.claim(1, request.requestId)).toBe(false);
  expect(() =>
    broker.complete(1, { ...request, scope: { ...scope, path: 'other.md' }, ok: true }),
  ).toThrow('作用域');
  expect(() => broker.complete(1, { ...request, runId: randomUUID(), ok: true })).toThrow('失效');
  broker.complete(1, { requestId: request.requestId, runId: request.runId, scope, ok: true });
  await expect(pending).resolves.toMatchObject({ ok: true });
  const expired = broker.request(1, {
    runId: randomUUID(),
    scope,
    command: { type: 'read', selection: false, from: 0, limit: 10 },
  });
  await expect(expired).rejects.toThrow('超时');
  expect(broker.claim(1, command.requestId)).toBe(false);
  const output: ChatMessage = { id: randomUUID(), role: 'assistant', text: '', status: 'running' };
  const { tools } = writingPack(
    { owner: 1, runId: randomUUID(), output, changed: () => {} },
    scope,
    broker,
  );
  expect(tools.map((t) => t.name)).toEqual([
    'read_document',
    'read_selection',
    'replace_range',
    'insert_text',
  ]);
  for (const tool of tools) expect(JSON.stringify(tool.parameters)).not.toContain('"path":');
  const replace = tools.find((t) => t.name === 'replace_range')!;
  await expect(
    replace.execute(
      'call',
      { from: 0, to: 0, text: 'x', version: await bufferVersion('') },
      undefined,
      undefined,
      {} as never,
    ),
  ).rejects.toThrow('先读取');
});

test('writing edits and paged reads preserve UTF-16 emoji boundaries', () => {
  const content = 'A🙂B',
    version = '0'.repeat(64);
  expect(
    editBuffer(content, { kind: 'replace_range', from: 1, to: 3, text: 'X', version }).after,
  ).toBe('AXB');
  expect(() =>
    editBuffer(content, { kind: 'replace_range', from: 1, to: 2, text: 'X', version }),
  ).toThrow('Unicode');
  expect(textSliceEnd(content, 0, 2)).toBe(1);
  expect(textSliceEnd(content, 1, 2)).toBe(3);
  expect(() => textSliceEnd(content, 1, 1)).toThrow('完整 Unicode');
});
