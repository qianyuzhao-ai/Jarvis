import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { GraphLinks, LINK_LEDGER_SESSION } from '../src/main/writing/graph-links';
import { GraphIndex } from '../src/main/writing/graph-index';
import { WritingFiles } from '../src/main/writing/files';
import { WritingBroker } from '../src/main/agent/writing-broker';
import { Ledger } from '../src/main/agent/kernel/ledger';
const version = (content: string) => createHash('sha256').update(content).digest('hex');

test('graph links use disk revisions, persist undo and never overwrite a changed source', async () => {
  const root = test.info().outputPath('notes');
  await mkdir(root, { recursive: true });
  const original = '# A\n\n[[missing|别名]]\n';
  await writeFile(join(root, 'a.md'), original);
  await writeFile(join(root, 'b.md'), '# B');
  const files = new WritingFiles(test.info().outputPath('roots.json'));
  const { id: rootId } = await files.addRoot(root);
  const graph = new GraphIndex(files, test.info().outputPath('index'));
  const ledger = new Ledger(test.info().outputPath('ledger'));
  const links = new GraphLinks(files, graph, new WritingBroker(), ledger, () => undefined);
  const receipt = await links.execute({ action: 'link', rootId, from: 'a.md', to: 'b.md' });
  expect(receipt.saved).toBe(true);
  expect(await readFile(join(root, 'a.md'), 'utf8')).toBe(original + '\n## 关联\n\n- [[b]]\n');
  expect(
    (await links.execute({ action: 'link', rootId, from: 'a.md', to: 'b.md' })).unchanged,
  ).toBe(true);
  expect(await readFile(join(root, 'b.md'), 'utf8')).toBe('# B');
  const restored = new Ledger(test.info().outputPath('ledger'));
  await restored.initialize([LINK_LEDGER_SESSION]);
  const resumed = new GraphLinks(files, graph, new WritingBroker(), restored, () => undefined);
  await resumed.execute({ action: 'undo', transactionId: receipt.transactionId! });
  expect(await readFile(join(root, 'a.md'), 'utf8')).toBe(original);
  const repair = await links.execute({
    action: 'repair',
    rootId,
    from: 'a.md',
    to: 'b.md',
    reference: 'missing',
    offset: original.indexOf('[['),
  });
  expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('# A\n\n[[b|别名]]\n');
  await writeFile(join(root, 'a.md'), '用户后续修改');
  await expect(
    links.execute({ action: 'undo', transactionId: repair.transactionId! }),
  ).rejects.toThrow('文档已被修改');
  await expect(
    links.execute({ action: 'link', rootId, from: 'a.md', to: '../other.md' }),
  ).rejects.toThrow('授权');
});

test('open graph sources use the owning buffer, reject conflicts and undo without saving', async () => {
  const root = test.info().outputPath('notes');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'a.md'), '# A');
  await writeFile(join(root, 'b.md'), '# B');
  const files = new WritingFiles(test.info().outputPath('roots.json'));
  const { id: rootId } = await files.addRoot(root);
  const broker = new WritingBroker();
  let content = '# A\n\n未保存文字',
    conflict = false;
  broker.dispatch = (owner, command) => {
    expect(owner).toBe(42);
    expect(broker.claim(owner, command.requestId)).toBe(true);
    if (conflict) {
      broker.complete(owner, { ...command, ok: false, error: '文档存在冲突' });
      return;
    }
    const operation = command.command;
    if (operation.type === 'edit') {
      const edit = operation.edit;
      expect(edit.version).toBe(version(content));
      if (edit.kind !== 'replace_range') throw new Error('unexpected');
      content = content.slice(0, edit.from) + edit.text + content.slice(edit.to);
    }
    broker.complete(owner, {
      requestId: command.requestId,
      runId: command.runId,
      scope: command.scope,
      ok: true,
      snapshot: {
        name: 'a.md',
        version: version(content),
        length: content.length,
        from: 0,
        text: content,
        next: null,
        selection: { from: 0, to: 0, text: '', truncated: false },
      },
    });
  };
  const links = new GraphLinks(
    files,
    new GraphIndex(files, test.info().outputPath('index')),
    broker,
    new Ledger(test.info().outputPath('ledger')),
    () => 42,
  );
  const receipt = await links.execute({ action: 'link', rootId, from: 'a.md', to: 'b.md' });
  expect(receipt.saved).toBe(false);
  expect(content).toContain('未保存文字\n\n## 关联');
  expect(await readFile(join(root, 'a.md'), 'utf8')).toBe('# A');
  await links.execute({ action: 'undo', transactionId: receipt.transactionId! });
  expect(content).toBe('# A\n\n未保存文字');
  conflict = true;
  await expect(links.execute({ action: 'link', rootId, from: 'a.md', to: 'b.md' })).rejects.toThrow(
    '冲突',
  );
});
