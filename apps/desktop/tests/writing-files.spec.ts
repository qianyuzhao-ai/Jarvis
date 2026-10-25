import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { WritingFiles } from '../src/main/writing/files';
import { writingAssetSchema } from '../src/shared/writing';

async function fixture() {
  const directory = test.info().outputPath('notes');
  await mkdir(directory, { recursive: true });
  const trashed: string[] = [],
    revealed: string[] = [];
  const files = new WritingFiles(test.info().outputPath('roots.json'), {
    trash: async (path) => {
      trashed.push(path);
    },
    reveal: (path) => {
      revealed.push(path);
    },
  });
  const root = await files.addRoot(directory);
  return { files, root, directory, trashed, revealed };
}

test('writing lists all formats, restricts text and preserves UTF-8 BOM and CRLF', async () => {
  const { files, root, directory } = await fixture();
  for (const name of [
    'a.md',
    'b.markdown',
    'c.txt',
    'd.png',
    'e.pdf',
    'f.docx',
    'g.zip',
    'h.mp3',
    '.hidden',
  ])
    await writeFile(join(directory, name), '\uFEFFhello\r\n');
  await mkdir(join(directory, 'folder'));
  expect((await files.list(root.id, '')).map((e) => [e.name, e.fileType])).toEqual([
    ['folder', undefined],
    ['a.md', 'markdown'],
    ['b.markdown', 'markdown'],
    ['c.txt', 'text'],
    ['d.png', 'image'],
    ['e.pdf', 'pdf'],
    ['f.docx', 'binary'],
    ['g.zip', 'binary'],
    ['h.mp3', 'audio'],
  ]);
  expect((await files.search(root.id, '.pdf')).map((e) => e.name)).toEqual(['e.pdf']);
  const before = await files.read(root.id, 'c.txt');
  await files.save(root.id, 'c.txt', 'next\n', before.revision);
  expect(await readFile(join(directory, 'c.txt'), 'utf8')).toBe('\uFEFFnext\r\n');
  await expect(files.save(root.id, 'c.txt', 'stale', before.revision)).rejects.toThrow('外部修改');
  await expect(files.read(root.id, 'd.png')).rejects.toThrow('不能作为文本');
  await writeFile(join(directory, 'invalid.txt'), Buffer.from([0xff, 0xfe]));
  await expect(files.read(root.id, 'invalid.txt')).rejects.toThrow('UTF-8');
  expect((await files.create(root.id, '', 'note', 'file')).name).toBe('note.md');
  expect((await files.create(root.id, '', 'code.ts', 'file')).name).toBe('code.ts');
  await expect(files.create(root.id, '', 'bad.png', 'file')).rejects.toThrow('不能作为文本');
});

test('writing file mutations reject escape, symlinks, collisions and nonempty trash', async () => {
  const { files, root, directory, trashed, revealed } = await fixture();
  await files.create(root.id, '', 'a', 'file');
  await files.create(root.id, '', 'folder', 'directory');
  await files.create(root.id, 'folder', 'child', 'directory');
  await files.rename(root.id, 'a.md', 'b.md');
  expect((await files.move(root.id, 'b.md', 'folder')).path).toBe('folder/b.md');
  expect((await files.duplicate(root.id, 'folder/b.md')).name).toBe('b 副本.md');
  expect((await files.duplicate(root.id, 'folder/b.md')).name).toBe('b 副本 2.md');
  await expect(files.rename(root.id, 'folder/b.md', 'b 副本.md')).rejects.toThrow('同名');
  await expect(files.rename(root.id, 'folder/b.md', '../escape')).rejects.toThrow('名称');
  await expect(files.move(root.id, 'folder', 'folder/child')).rejects.toThrow('自身或子目录');
  await expect(files.move(root.id, 'folder/b.md', '..')).rejects.toThrow('路径');
  await expect(files.trash(root.id, 'folder')).rejects.toThrow('不为空');
  await expect(files.trash(root.id, '')).rejects.toThrow('授权文件夹');
  await files.trash(root.id, 'folder/child');
  await files.trash(root.id, 'folder/b.md');
  await files.reveal(root.id, 'folder/b.md');
  expect(trashed).toEqual([join(directory, 'folder/child'), join(directory, 'folder/b.md')]);
  expect(revealed).toEqual([join(directory, 'folder/b.md')]);
  if (process.platform !== 'win32') {
    const outside = test.info().outputPath('outside.md');
    await writeFile(outside, 'secret');
    await symlink(outside, join(directory, 'link.md'));
    expect((await files.list(root.id, '')).some((e) => e.name === 'link.md')).toBe(false);
    for (const action of [
      () => files.rename(root.id, 'link.md', 'safe.md'),
      () => files.move(root.id, 'link.md', 'folder'),
      () => files.duplicate(root.id, 'link.md'),
      () => files.trash(root.id, 'link.md'),
      () => files.reveal(root.id, 'link.md'),
    ])
      await expect(action()).rejects.toThrow('符号链接');
    expect(await readFile(outside, 'utf8')).toBe('secret');
  }
});

test('writing assets validate format and size, deduplicate and reject linked asset folders', async () => {
  const { files, root, directory } = await fixture();
  await files.create(root.id, '', 'note', 'file');
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  const path = await files.saveAsset(root.id, 'note.md', 'image/png', bytes);
  expect(await files.saveAsset(root.id, 'note.md', 'image/png', bytes)).toBe(path);
  expect(await readFile(join(directory, path))).toEqual(bytes);
  await expect(files.saveAsset(root.id, 'note.md', 'image/jpeg', bytes)).rejects.toThrow('不匹配');
  expect(
    writingAssetSchema.safeParse({
      rootId: root.id,
      documentPath: 'note.md',
      mime: 'image/png',
      bytes: new Uint8Array(10 * 1024 * 1024 + 1),
    }).success,
  ).toBe(false);
  if (process.platform !== 'win32') {
    await files.create(root.id, '', 'linked', 'directory');
    await files.create(root.id, 'linked', 'note', 'file');
    await symlink(directory, join(directory, 'linked/assets'));
    await expect(files.saveAsset(root.id, 'linked/note.md', 'image/png', bytes)).rejects.toThrow(
      '符号链接',
    );
  }
});

test('writing asset responses support bounded ranges and reject non-media and traversal', async () => {
  const { writingAssetResponse } = await import('../src/main/writing/asset-protocol');
  const { files, root, directory } = await fixture();
  await writeFile(join(directory, 'clip.mp4'), '0123456789');
  await writeFile(join(directory, 'private.md'), 'secret');
  const request = (path: string, range?: string) =>
    writingAssetResponse(
      files,
      new Request(`jarvis-writing://${root.id}/${encodeURIComponent(path)}`, {
        headers: range ? { range } : {},
      }),
    );
  const partial = await request('clip.mp4', 'bytes=2-5');
  expect(partial.status).toBe(206);
  expect(partial.headers.get('content-range')).toBe('bytes 2-5/10');
  expect(await partial.text()).toBe('2345');
  expect(await (await request('clip.mp4', 'bytes=-3')).text()).toBe('789');
  expect((await request('clip.mp4', 'bytes=100-')).status).toBe(416);
  expect((await request('private.md')).status).toBe(404);
  expect((await request('../private.mp4')).status).toBe(404);
  expect(
    (
      await writingAssetResponse(
        files,
        new Request(`jarvis-writing://${root.id}/clip.mp4`, { method: 'POST' }),
      )
    ).status,
  ).toBe(405);
});
