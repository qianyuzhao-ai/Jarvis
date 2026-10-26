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

test('an edited block keeps tight or loose lists, ordered delimiters, heading style and [X]', () => {
  const edit = (source: string) => {
    const { doc } = parse(source);
    const json = doc.toJSON();
    const walk = (node: { text?: string; content?: unknown[] }): boolean => {
      if (typeof node.text === 'string') {
        node.text += 'Z';
        return true;
      }
      return ((node.content ?? []) as { text?: string; content?: unknown[] }[]).some(walk);
    };
    walk(json.content[0]);
    return serialize(writingSchema.nodeFromJSON(json));
  };
  expect(edit('* a\n* b\n')).toBe('* aZ\n* b\n');
  expect(edit('- a\n\n- b\n')).toBe('- aZ\n\n- b\n');
  expect(edit('1) one\n2) two\n')).toBe('1) oneZ\n2) two\n');
  expect(edit('7. seven\n8. eight\n')).toBe('7. sevenZ\n8. eight\n');
  expect(edit('- a\n  - nested\n  - more\n- b\n')).toBe('- aZ\n  - nested\n  - more\n- b\n');
  expect(edit('- [X] done\n- [ ] todo\n')).toBe('- [X] doneZ\n- [ ] todo\n');
  expect(edit('Title\n=====\n')).toBe('TitleZ\n======\n');
  expect(edit('## Head ##\n')).toBe('## HeadZ ##\n');
});

test('unusual CommonMark and GFM sources roundtrip byte-for-byte', () => {
  const samples = [
    'Title\n=====\n\nSub\n---\n\nbody\n',
    'para\n\n    code line 1\n    code line 2\n\nafter\n',
    '- item one\ncontinued lazily\n- item two\n  > quote in list\n',
    'line one  \nline two\\\nline three\n',
    '\\*not em\\* \\_x\\_ \\# not heading &amp; &nbsp; &copy;\n',
    'See [docs][1] and [site].\n\n[1]: https://a.example/x "Title"\n[site]: <https://b.example>\n',
    'Go <https://a.example> or https://b.example/path?q=1 now.\n',
    '| a | b |\n|:--|--:|\n| `x|y` | c \\| d |\n',
    'Text[^1].\n\n[^1]: The note\n    with continuation.\n',
    '$$\nE = mc^2\n$$\n',
    '<!-- hidden -->\n\nVisible\n',
    '*a* _b_ ***c*** ~~d~~ ~e~ **中文**，后面\n',
    '1) one\n2) two\n',
    '***\n\n___\n\n- - -\n',
    '# H\n\nlast line without newline',
    'para\n\n\n\n',
    '-\titem with tab\n\n\tcode by tab\n',
    '## Title ##\n\n### Other ###   \n',
    '````md\n```js\ninner\n```\n````\n',
    '![alt text](img/a.png "A title") and [link](<a b.md>)\n',
    '1. first\n    - nested a\n    - nested b\n2. second\n\n   continuation para\n',
    'para one\n   \npara two\n',
    'Text with <kbd>Ctrl</kbd> and <br> inline.\n',
  ];
  for (const source of samples) {
    const { doc } = parse(source);
    doc.check();
    expect(serialize(doc), JSON.stringify(source)).toBe(source);
  }
});
