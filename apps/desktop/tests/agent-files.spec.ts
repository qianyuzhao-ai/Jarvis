import { randomUUID } from 'node:crypto';
import { mkdir, readFile, symlink, writeFile, access } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { JsonFile } from '../src/main/agent/json-file';
import type { KeyCipher } from '../src/main/agent/key-cipher';
import { LocalFiles } from '../src/main/agent/local-files';
import { ModelStore } from '../src/main/agent/model-store';
import { AgentService } from '../src/main/agent/service';
import { AgentStore } from '../src/main/agent/store';
import { lineDiff } from '../src/main/agent/packs/files';

const exists = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

test('file access stays inside authorized folders, keeps snapshots and undoes a round in reverse', async () => {
  const dir = test.info().outputPath('files');
  const folder = join(dir, '资料');
  const outside = join(dir, 'outside');
  await mkdir(join(folder, '子目录'), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(folder, '笔记.md'), '第一行\n第二行');
  await writeFile(join(outside, 'secret.txt'), '机密');
  await symlink(outside, join(folder, '外链'));
  await symlink(join(outside, 'secret.txt'), join(folder, 'secret-link.txt'));
  const files = new LocalFiles(join(dir, 'folders.json'), join(dir, 'snapshots'));
  await files.initialize();
  await expect(files.add('/')).rejects.toThrow('根目录');
  const [added] = await files.add(folder);
  if (!added) throw new Error('Missing folder');
  const id = added.id;
  const reread = new LocalFiles(join(dir, 'folders.json'), join(dir, 'snapshots'));
  await reread.initialize();
  expect(reread.list().map((f) => f.name)).toEqual(['资料']);

  // Reading, listing and searching stay inside; links are not followed out of the folder.
  expect((await files.listDir(id)).map((e) => e.name)).toEqual(['子目录', '笔记.md']);
  expect((await files.readText(id, '笔记.md')).content).toBe('第一行\n第二行');
  for (const escape of ['../outside/secret.txt', '外链/secret.txt', 'secret-link.txt'])
    await expect(files.readText(id, escape)).rejects.toThrow(/授权文件夹内|只能操作普通文件/);
  await expect(files.readText(id, join(outside, 'secret.txt'))).rejects.toThrow('相对路径');
  await expect(files.createFile(id, '外链/new.txt', 'x')).rejects.toThrow('授权文件夹内');
  await expect(
    files.createFile(randomUUID().replaceAll('-', '').slice(0, 24), 'a.txt', 'x'),
  ).rejects.toThrow('没有这个授权文件夹');
  expect(await readFile(join(outside, 'secret.txt'), 'utf8')).toBe('机密');

  // A round: create, mkdir, overwrite, move, delete; then undo all of it.
  const ops = [
    (await files.createFile(id, '新文件.txt', '新内容')).op,
    (await files.createFolder(id, '归档')).op,
    (await files.overwrite(id, '笔记.md', '改写后')).op,
    (await files.move(id, '新文件.txt', '归档/新文件.txt')).op,
  ];
  await writeFile(join(folder, '待删.txt'), '要删除的');
  ops.push((await files.delete(id, '待删.txt')).op);
  await expect(files.createFile(id, '笔记.md', 'x')).rejects.toThrow();
  expect(await readFile(join(folder, '笔记.md'), 'utf8')).toBe('改写后');
  expect(await exists(join(folder, '待删.txt'))).toBe(false);
  expect(await files.undo(ops)).toEqual({ remaining: [], error: null });
  expect(await readFile(join(folder, '笔记.md'), 'utf8')).toBe('第一行\n第二行');
  expect(await readFile(join(folder, '待删.txt'), 'utf8')).toBe('要删除的');
  expect(await exists(join(folder, '归档'))).toBe(false);
  expect(await exists(join(folder, '新文件.txt'))).toBe(false);

  // A file changed after the round stops the undo there; the rest is kept for a retry.
  const later = [
    (await files.createFile(id, 'a.txt', 'A')).op,
    (await files.overwrite(id, '笔记.md', 'B')).op,
  ];
  await writeFile(join(folder, '笔记.md'), '用户又改了');
  const partial = await files.undo(later);
  expect(partial.error).toContain('之后又被修改');
  expect(partial.remaining).toHaveLength(2);
  expect(await readFile(join(folder, '笔记.md'), 'utf8')).toBe('用户又改了');

  expect(lineDiff('a\nb\nc', 'a\nc\nd')).toEqual({
    added: 1,
    removed: 1,
    diff: '@@ -1,3 +1,3 @@\n a\n-b\n c\n+d',
  });
});

test('the main Agent asks before overwriting or deleting, is blocked outside folders, and its round undoes', async () => {
  const dir = test.info().outputPath('agent-files');
  const folder = join(dir, '下载');
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, '清单.txt'), '苹果\n香蕉');
  await writeFile(join(folder, '旧报告.txt'), '旧的');
  const files = new LocalFiles(join(dir, 'folders.json'), join(dir, 'snapshots'));
  await files.initialize();
  const [added] = await files.add(folder);
  const bodies: {
    messages: { role: string; content: unknown }[];
    tools?: { function: { name: string } }[];
  }[] = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const part of req) chunks.push(part);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    bodies.push(body);
    const userIndex = body.messages.findLastIndex((m: { role: string }) => m.role === 'user');
    const step = body.messages
      .slice(userIndex + 1)
      .filter((m: { role: string }) => m.role === 'tool').length;
    const folderId = added?.id;
    const steps: [string, unknown][] = [
      ['list_folders', {}],
      ['read_file', { folderId, path: '清单.txt' }],
      ['read_file', { folderId, path: '../../etc/passwd' }],
      ['create_file', { folderId, path: '汇总.txt', content: '共 2 项' }],
      ['overwrite_file', { folderId, path: '清单.txt', content: '苹果\n香蕉\n橙子' }],
      ['delete_file', { folderId, path: '旧报告.txt' }],
    ];
    const next = steps[step];
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: unknown, finish: string | null = null) =>
      `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 1, model: 'mock', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
    res.end(
      (next
        ? chunk({
            tool_calls: [
              {
                index: 0,
                id: randomUUID(),
                type: 'function',
                function: { name: next[0], arguments: JSON.stringify(next[1]) },
              },
            ],
          }) + chunk({}, 'tool_calls')
        : chunk({ content: '已整理，旧报告按你的意思保留。' }) + chunk({}, 'stop')) +
        'data: [DONE]\n\n',
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server');
  const cipher: KeyCipher = { available: () => true, encrypt: (t) => t, decrypt: (t) => t };
  const models = new ModelStore(new JsonFile(join(dir, 'agent', 'connection.json')), cipher);
  await models.initialize();
  const store = new AgentStore(new JsonFile(join(dir, 'agent', 'index.json')));
  const service = new AgentService(models, store, join(dir, 'agent'), { folders: files });
  // The user approves the overwrite and declines the deletion.
  const asked: string[] = [];
  service.approvals.onChange = (owner) => {
    for (const request of service.approvals.list(owner)) {
      if (asked.includes(request.id)) continue;
      asked.push(request.id);
      queueMicrotask(() =>
        service.approvals.respond(owner, request.id, request.toolName === 'overwrite_file'),
      );
    }
  };
  try {
    const provider = await models.saveProvider({
      kind: 'custom',
      name: 'Relay',
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      api: 'openai-completions',
      apiKey: '',
      clearKey: false,
    });
    await models.setProviderModels(provider, [{ modelId: 'mock' }]);
    const home = await service.create();
    await service.send(home, randomUUID(), '整理下载文件夹', 1);
    await expect
      .poll(() => Object.keys(service.snapshot().snapshot.runs).length, { timeout: 15000 })
      .toBe(0);
    expect(asked).toHaveLength(2);
    const results = (bodies.at(-1)?.messages ?? [])
      .filter((m) => m.role === 'tool')
      .map((m) => String(m.content));
    expect(results[0]).not.toContain(folder);
    expect(results[2]).toContain('路径不在授权文件夹内');
    expect(results[5]).toContain('用户拒绝');
    expect(await readFile(join(folder, '汇总.txt'), 'utf8')).toBe('共 2 项');
    expect(await readFile(join(folder, '清单.txt'), 'utf8')).toBe('苹果\n香蕉\n橙子');
    expect(await readFile(join(folder, '旧报告.txt'), 'utf8')).toBe('旧的');
    const reply = store.record(home).view.messages.at(-1);
    const edited = reply?.activities?.find((a) => a.label.startsWith('已覆盖文件'));
    expect(edited?.files[0]).toMatchObject({
      path: '下载/清单.txt',
      action: 'edited',
      added: 1,
      removed: 0,
    });
    expect(reply?.activities?.some((a) => a.label.includes('已拒绝'))).toBe(true);
    const transactionId = edited?.transactionId ?? '';

    await service.undo(1, { transactionId, files: true });
    expect(await exists(join(folder, '汇总.txt'))).toBe(false);
    expect(await readFile(join(folder, '清单.txt'), 'utf8')).toBe('苹果\n香蕉');
    expect(
      store
        .record(home)
        .view.messages.at(-1)
        ?.activities?.filter((a) => a.transactionId === transactionId)
        .every((a) => a.undone),
    ).toBe(true);
    await expect(service.undo(1, { transactionId, files: true })).rejects.toThrow('已撤销');
    expect(bodies[0]?.tools?.map((t) => t.function.name)).toEqual(
      expect.arrayContaining([
        'list_folders',
        'read_file',
        'create_file',
        'move_file',
        'overwrite_file',
        'delete_file',
      ]),
    );
  } finally {
    await service.shutdown();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
