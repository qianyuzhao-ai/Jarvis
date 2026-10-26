import { mkdir, writeFile, rename, unlink, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { WritingFiles } from '../src/main/writing/files';
import { GraphIndex } from '../src/main/writing/graph-index';

test('graph indexes scoped metadata, references, assets, incremental changes and restart cache', async () => {
  const root = test.info().outputPath('notes');
  await mkdir(join(root, 'sub'), { recursive: true });
  await writeFile(
    join(root, 'a.md'),
    '# A\n\n[[b]] #共同\n\n[子文档](sub/b.md)\n\n![图](photo.png)\n\n[[missing]]\n\n`[[ignored]]`',
  );
  await writeFile(join(root, 'b.md'), '# B\n\n同目录摘要');
  await writeFile(join(root, 'sub/b.md'), '# 子 B\n\n其他目录秘密');
  await writeFile(join(root, 'photo.png'), 'binary');
  await writeFile(join(root, '.hidden.md'), 'hidden');
  await symlink(join(root, 'b.md'), join(root, 'symlink.md'));
  const files = new WritingFiles(test.info().outputPath('roots.json'));
  const approved = await files.addRoot(root);
  const index = new GraphIndex(files, test.info().outputPath('index'));
  const graph = await index.graph(approved.id);
  expect(graph.dots).toHaveLength(4);
  expect(graph.links.map((l) => l.target)).toEqual(['b.md', null, 'sub/b.md', 'photo.png']);
  expect(graph.dots.find((d) => d.path === 'b.md')?.inbound).toBe(1);
  expect(graph.tags).toEqual([{ tag: '共同', paths: ['a.md'] }]);
  const related = await index.related(approved.id, 'a.md');
  expect(related.map((d) => d.path)).toEqual(['b.md']);
  expect(Object.keys(related[0]!).sort()).toEqual(['mtime', 'path', 'summary', 'tags', 'title']);
  expect(JSON.stringify(related)).not.toContain('秘密');
  expect((await index.backlinks(approved.id, 'a.md')).broken.map((l) => l.reference)).toEqual([
    'missing',
  ]);
  let reads = 0;
  const read = files.read.bind(files);
  files.read = (...args) => {
    reads++;
    return read(...args);
  };
  const restarted = new GraphIndex(files, test.info().outputPath('index'));
  expect(await restarted.graph(approved.id)).toEqual(graph);
  expect(reads).toBe(0);
  await writeFile(join(root, 'b.md'), '# B updated\n\n#新标签');
  expect((await restarted.graph(approved.id)).dots.find((d) => d.path === 'b.md')?.title).toBe(
    'B updated',
  );
  expect(reads).toBe(1);
  await rename(join(root, 'b.md'), join(root, 'new.md'));
  await unlink(join(root, 'photo.png'));
  const changed = await restarted.graph(approved.id);
  expect(changed.dots.map((d) => d.path)).toContain('new.md');
  expect(changed.dots.map((d) => d.path)).not.toContain('photo.png');
  expect(changed.links.find((l) => l.reference === 'b')?.target).toBe('sub/b.md');
  await expect(index.graph('../outside')).rejects.toThrow('授权');
  expect(
    (await new GraphIndex(files, test.info().outputPath('small'), 2).graph(approved.id)).truncated,
  ).toBe(true);
});

test('graph metadata excludes frontmatter and nested code links; oversized files remain explicitly truncated', async () => {
  const { markdownMetadata, associationOffset } = await import(
    '../src/main/writing/graph-markdown'
  );
  const markdown =
    '---\nsecret: "[[private]]"\n---\n\n# 标题\n\n> ```\n> [[not-a-link]]\n> ```\n\n[[real]]\n\n```\n## 关联\n```';
  const data = markdownMetadata(markdown);
  expect(data.title).toBe('标题');
  expect(data.refs.map((ref) => ref.reference)).toEqual(['real']);
  expect(data.summary).not.toContain('private');
  expect(associationOffset(markdown)).toBeNull();
  const root = test.info().outputPath('notes');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'large.md'), 'x'.repeat(4 * 1024 * 1024 + 1));
  const files = new WritingFiles(test.info().outputPath('roots.json'));
  const { id } = await files.addRoot(root);
  const graph = new GraphIndex(files, test.info().outputPath('index'));
  expect((await graph.graph(id)).truncated).toBe(true);
  expect((await graph.graph(id)).truncated).toBe(true);
});
