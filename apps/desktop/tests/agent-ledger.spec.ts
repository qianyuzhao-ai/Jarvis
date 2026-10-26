import { randomUUID } from 'node:crypto';
import { access, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { LEDGER_ROUNDS, Ledger } from '../src/main/agent/kernel/ledger';

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
