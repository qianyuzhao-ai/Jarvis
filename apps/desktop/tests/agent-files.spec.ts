import { randomUUID } from 'node:crypto';
import { mkdir, readFile, symlink, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { LocalFiles } from '../src/main/agent/local-files';
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
