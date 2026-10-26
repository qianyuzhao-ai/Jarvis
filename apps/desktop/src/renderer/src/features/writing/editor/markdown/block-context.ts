import { parse } from './roundtrip';

export function blockContext(content: string, offset: number) {
  const { doc, blocks } = parse(content);
  const headings: { level: number; text: string }[] = [];
  let type = 'paragraph';
  doc.forEach((node, _position, index) => {
    const range = blocks[index]!;
    if (range.from > offset) return;
    type = node.type.name;
    if (type === 'heading') {
      while (headings.length && headings.at(-1)!.level >= node.attrs.level) headings.pop();
      headings.push({ level: node.attrs.level, text: node.textContent });
    }
  });
  return { type, headingPath: headings.map((heading) => heading.text) };
}
