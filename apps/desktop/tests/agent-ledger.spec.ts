import { randomUUID } from 'node:crypto';
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { LEDGER_ROUNDS, Ledger } from '../src/main/agent/kernel/ledger';
import { ModelStore } from '../src/main/agent/model-store';
import { AgentService } from '../src/main/agent/service';
import { AgentStore } from '../src/main/agent/store';

test('ledger merges a round, keeps recent rounds, survives restart and forgets deleted conversations', async () => {
  const dir = test.info().outputPath('ledger');
  const session = randomUUID(),
    other = randomUUID(),
    gone = randomUUID();
  const ledger = new Ledger(dir);
  await ledger.initialize([session]);
  const id = randomUUID(),
    runId = randomUUID();
  ledger.record({
    id,
    sessionId: session,
    runId,
    pack: 'canvas',
    projectId: randomUUID(),
    summary: '第一次',
  });
  ledger.record({ id, sessionId: session, runId, pack: 'canvas', summary: '同一轮第二次' });
  expect(ledger.entries(session)).toHaveLength(1);
  expect(ledger.find(id)).toMatchObject({ summary: '同一轮第二次', status: 'applied' });
  for (let i = 0; i < LEDGER_ROUNDS + 5; i++)
    ledger.record({
      id: randomUUID(),
      sessionId: other,
      runId: randomUUID(),
      pack: 'writing',
      writingScope: { rootId: randomUUID(), path: 'a.md' },
      summary: `第 ${i} 轮`,
    });
  expect(ledger.entries(other)).toHaveLength(LEDGER_ROUNDS);
  expect(ledger.entries(other)[0]?.summary).toBe('第 5 轮');
  ledger.markUndone(id);
  await ledger.settled();

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${gone}.json`), '{"broken":');
  const restarted = new Ledger(dir);
  await restarted.initialize([session, other]);
  expect(restarted.find(id)).toMatchObject({ status: 'undone', summary: '同一轮第二次' });
  expect(restarted.entries(other)).toHaveLength(LEDGER_ROUNDS);
  await restarted.remove(other);
  await expect(access(join(dir, `${other}.json`))).rejects.toThrow();
  expect(restarted.entries(other)).toEqual([]);
  expect(JSON.parse(await readFile(join(dir, `${session}.json`), 'utf8')).version).toBe(1);

  const errors: unknown[] = [];
  await writeFile(test.info().outputPath('not-a-dir'), '');
  const broken = new Ledger(join(test.info().outputPath('not-a-dir'), 'ledger'));
  broken.onError = (error) => errors.push(error);
  broken.record({ id: randomUUID(), sessionId: session, runId, pack: 'canvas', summary: 'x' });
  await broken.settled();
  await expect.poll(() => errors.length).toBe(1);
});

test('undo goes through the ledger to the window that owns the data and is recorded once', async () => {
  const cipher: KeyCipher = { available: () => true, encrypt: (t) => t, decrypt: (t) => t };
  const root = test.info().outputPath('agent');
  const models = new ModelStore(new JsonFile(`${root}/connection.json`), cipher);
  await models.initialize();
  const service = new AgentService(
    models,
    new AgentStore(new JsonFile(`${root}/index.json`)),
    root,
  );
  const sessionId = randomUUID(),
    runId = randomUUID(),
    projectId = randomUUID(),
    canvasEdit = randomUUID(),
    writingEdit = randomUUID(),
    scope = { rootId: randomUUID(), path: '甲.md' };
  service.ledger.record({
    id: canvasEdit,
    sessionId,
    runId,
    pack: 'canvas',
    projectId,
    summary: '已修改画布',
  });
  service.ledger.record({
    id: writingEdit,
    sessionId,
    runId,
    pack: 'writing',
    writingScope: scope,
    summary: '已修改',
  });
  let fail = '';
  const commands: unknown[] = [];
  service.canvas.dispatch = (owner, command) => {
    commands.push(command.command);
    expect(service.canvas.claim(owner, command.requestId)).toBe(true);
    service.canvas.complete(owner, {
      requestId: command.requestId,
      projectId: command.projectId,
      ok: !fail,
      ...(fail ? { error: fail } : {}),
    });
  };
  service.writing.dispatch = (owner, command) => {
    commands.push(command.command);
    expect(service.writing.claim(owner, command.requestId)).toBe(true);
    expect(command.runId).toBe(runId);
    service.writing.complete(owner, {
      requestId: command.requestId,
      runId: command.runId,
      scope: command.scope,
      ok: true,
    });
  };

  fail = '画布已发生后续修改，为保留你的工作，暂不能撤销这次操作';
  await expect(service.undo(1, { transactionId: canvasEdit, projectId })).rejects.toThrow(
    '后续修改',
  );
  expect(service.ledger.find(canvasEdit)?.status).toBe('applied');
  fail = '';
  await service.undo(1, { transactionId: canvasEdit, projectId });
  expect(service.ledger.find(canvasEdit)?.status).toBe('undone');
  await expect(service.undo(1, { transactionId: canvasEdit, projectId })).rejects.toThrow('已撤销');
  await service.undo(1, { transactionId: writingEdit, writingScope: scope });
  expect(service.ledger.find(writingEdit)?.status).toBe('undone');
  // A change from before the ledger existed is still sent to its window, which checks it.
  await service.undo(1, { transactionId: randomUUID(), projectId });
  expect(commands).toEqual([
    { type: 'undo', transactionId: canvasEdit },
    { type: 'undo', transactionId: canvasEdit },
    { type: 'undo', transactionId: writingEdit },
    { type: 'undo', transactionId: expect.any(String) },
  ]);
  await service.ledger.settled();
  const restarted = new Ledger(join(root, 'ledger'));
  await restarted.initialize([sessionId]);
  expect(restarted.entries(sessionId).map((e) => e.status)).toEqual(['undone', 'undone']);
});
