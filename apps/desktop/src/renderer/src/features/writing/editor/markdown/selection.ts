import type { Node } from '@tiptap/pm/model';
import { blockRanges, serialize } from './roundtrip';
function spans(doc: Node) {
  const markdown = serialize(doc),
    blocks = blockRanges(doc);
  const result: { position: number; offset: number; length: number }[] = [];
  doc.forEach((block, position, index) => {
    const range = blocks[index]!;
    let cursor = range.from;
    block.descendants((node, local) => {
      if (!node.isText) return;
      let positionOffset = 0;
      for (const part of (node.text ?? '').split('\n')) {
        const found = markdown.indexOf(part, cursor);
        const offset = found >= 0 && found <= range.to ? found : cursor;
        result.push({
          position: position + 1 + local + positionOffset,
          offset,
          length: part.length,
        });
        cursor = offset + part.length;
        positionOffset += part.length + 1;
      }
    });
  });
  return result;
}
export function positionToSource(doc: Node, position: number) {
  const items = spans(doc);
  for (const item of items)
    if (position >= item.position && position <= item.position + item.length)
      return item.offset + position - item.position;
  const prior = items.filter((s) => s.position <= position).at(-1);
  return prior ? prior.offset + prior.length : 0;
}
export function sourceToPosition(doc: Node, offset: number) {
  const items = spans(doc);
  for (const item of items)
    if (offset >= item.offset && offset <= item.offset + item.length)
      return item.position + offset - item.offset;
  const next = items.find((s) => s.offset > offset);
  return next?.position ?? Math.max(0, doc.content.size - 1);
}
