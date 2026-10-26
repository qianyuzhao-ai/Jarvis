import { expect, test } from '@playwright/test';
import { parse, serialize } from '../src/renderer/src/features/writing/editor/markdown/roundtrip';
import { writingSchema } from '../src/renderer/src/features/writing/editor/extensions';
import {
  editMindMap,
  mindMapLayout,
  parseMindMap,
} from '../src/renderer/src/features/writing/blocks/mindmap';

test('rich blocks parse into editable nodes and serialize interoperable Markdown after edits', () => {
  const samples = [
    ['> [!NOTE] 标题\n> 内容', 'callout'],
    ['<details><summary>展开</summary>\n\n正文 [[链接|别名]] #tag\n\n</details>', 'toggleBlock'],
    ['```mindmap\n- 中心\n  - 分支\n```', 'mindMap'],
    ['```mermaid\nflowchart LR\n A-->B\n```', 'mermaid'],
  ];
  for (const [source, kind] of samples) {
    const { doc } = parse(source!);
    doc.check();
    expect(doc.firstChild?.type.name).toBe(kind);
    expect(serialize(doc)).toBe(source);
    const json = doc.toJSON();
    if (kind === 'callout') json.content[0].attrs.tone = 'warning';
    else if (kind === 'toggleBlock') json.content[0].attrs.summary = '新标题';
    else json.content[0].attrs.code += '\n';
    const edited = writingSchema.nodeFromJSON(json);
    edited.check();
    const text = serialize(edited);
    expect(parse(text).doc.firstChild?.type.name).toBe(kind);
    if (kind === 'callout') expect(text).toContain('[!WARNING]');
    if (kind === 'toggleBlock') {
      expect(text).toContain('<summary>新标题</summary>');
      expect(text).toContain('[[链接|别名]]');
    }
  }
});
test('mind maps keep one root, use two-space indentation and edit subtrees without layout data', () => {
  const source = '- 中心\n  - A\n    - 叶子\n  - B';
  const items = parseMindMap(source);
  expect(items.map((n) => n.parent)).toEqual([null, '0', '1', '0']);
  expect(mindMapLayout(items).get('2')?.x).toBe(400);
  expect(editMindMap(source, '0', 'delete')).toBe(source);
  expect(editMindMap(source, '1', 'delete')).toBe('- 中心\n  - B');
  expect(editMindMap(source, '1', 'child', '新增')).toContain('    - 新增');
  expect(editMindMap(source, '1', 'sibling', '同级')).toContain('  - 同级');
  expect(() => parseMindMap('- 中心\n   - 错误')).toThrow('两个空格');
  expect(() => parseMindMap('- 一\n- 二')).toThrow('中心');
});
test('changing table column alignment updates the GFM delimiter', () => {
  const { doc } = parse('| A | B |\n| :--- | ---: |\n| x | y |');
  const json = doc.toJSON();
  for (const row of json.content[0].content) row.content[0].attrs.align = 'center';
  const text = serialize(writingSchema.nodeFromJSON(json));
  const reread = parse(text).doc.firstChild!;
  expect(reread.firstChild?.firstChild?.attrs.align).toBe('center');
  expect(reread.firstChild?.lastChild?.attrs.align).toBe('right');
});

test('slash command filtering supports Chinese, full pinyin, initials and English', async () => {
  const { filterSlashCommands } = await import(
    '../src/renderer/src/features/writing/editor/slash-commands'
  );
  for (const query of ['思维', 'siweidaotu', 'swdt', 'mindmap'])
    expect(filterSlashCommands(query).some((entry) => entry.id === 'mindMap')).toBe(true);
  expect(filterSlashCommands('zzzz-no-command')).toHaveLength(0);
  expect(filterSlashCommands('').filter((entry) => entry.group === 'AI 写作助手')).toHaveLength(5);
});
