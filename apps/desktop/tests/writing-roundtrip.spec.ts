import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  parse,
  serialize,
  textPatch,
} from '../src/renderer/src/features/writing/editor/markdown/roundtrip';
import { writingSchema } from '../src/renderer/src/features/writing/editor/extensions';
const directory = join(import.meta.dirname, 'fixtures/writing-roundtrip');
test('Markdown fixtures roundtrip byte-for-byte including BOM, CRLF and near 4 MiB', async () => {
  test.setTimeout(60000);
  const names = (await readdir(directory)).filter((name) => name.endsWith('.md'));
  expect(await readFile(join(directory, '12-crlf.md'), 'utf8')).toContain('\r\n');
  expect((await readFile(join(directory, '13-bom.md'))).subarray(0, 3)).toEqual(
    Buffer.from([0xef, 0xbb, 0xbf]),
  );
  expect(names.length).toBeGreaterThanOrEqual(15);
  for (const name of names) {
    const original = await readFile(join(directory, name));
    const { doc } = parse(original.toString('utf8'));
    doc.check();
    expect(Buffer.from(serialize(doc)), name).toEqual(original);
  }
});
test('editing one top-level block preserves every other source byte and its separators', () => {
  const source =
    '\ufeff# title\r\n\r\n\r\nAn **original** paragraph.\r\n\r\n* item\r\n* second\r\n';
  const { doc, blocks } = parse(source);
  const edited = doc.toJSON();
  edited.content[1].content[0].text = 'Changed ';
  const result = serialize(writingSchema.nodeFromJSON(edited));
  expect(result.slice(0, blocks[1]!.from)).toBe(source.slice(0, blocks[1]!.from));
  expect(result.endsWith(source.slice(blocks[1]!.to))).toBe(true);
  const patch = textPatch(source, result);
  expect(patch.from).toBeGreaterThanOrEqual(blocks[1]!.from);
  expect(patch.to).toBeLessThanOrEqual(blocks[1]!.to);
  expect(source.slice(0, patch.from) + patch.text + source.slice(patch.to)).toBe(result);
});
test('unknown HTML and reference structures are inert source blocks; extensions retain syntax', () => {
  for (const content of ['<script>alert(1)</script>', '[^note]: source', '---\nicon: 😀\n---']) {
    const { doc } = parse(content);
    expect(doc.firstChild?.type.name).toBe('rawBlock');
    expect(serialize(doc)).toBe(content);
  }
});

test('frontmatter icon changes only its scalar and shared link rules exclude code and URL fragments', async () => {
  const { setDocumentIcon } = await import(
    '../src/renderer/src/features/writing/editor/frontmatter'
  );
  const { writingLinks } = await import('../src/shared/writing-links');
  const input =
    '\ufeff---\r\n# keep\r\ntitle:  "原样"\r\nicon: 📝 # comment\r\ncustom: [a,b]\r\n---\r\n\r\n# Heading\r\n';
  expect(setDocumentIcon(input, '💡')).toBe(input.replace('📝', '"💡"'));
  expect(
    writingLinks(
      '# Heading\n[[note|alias]] #tag https://x/#fragment `#code [[no]]`\n```md\n#no [[no]]\n```',
    ).map((r) => [r.kind, r.target]),
  ).toEqual([
    ['wiki', 'note'],
    ['tag', 'tag'],
  ]);
});

test('editing a paragraph retains wiki syntax instead of escaping reference brackets', () => {
  const { doc } = parse('See [[note|alias]] #tag.\n');
  const json = doc.toJSON();
  json.content[0].content[0].text += ' more';
  expect(serialize(writingSchema.nodeFromJSON(json))).toContain('[[note|alias]]');
});
