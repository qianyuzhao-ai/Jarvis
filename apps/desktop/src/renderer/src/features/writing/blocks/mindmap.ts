export interface MindItem {
  id: string;
  label: string;
  depth: number;
  parent: string | null;
}
export function parseMindMap(source: string): MindItem[] {
  const items: MindItem[] = [],
    stack: MindItem[] = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^( *)(?:[-+*]) (.+)$/.exec(line);
    if (!match || match[1]!.length % 2) throw new Error('每级使用两个空格缩进的 Markdown 列表');
    const depth = match[1]!.length / 2;
    if ((!items.length && depth !== 0) || (items.length && depth === 0) || depth > stack.length)
      throw new Error('需要一个中心主题，缩进不能跳级');
    const item = {
      id: String(items.length),
      label: match[2]!,
      depth,
      parent: depth ? stack[depth - 1]!.id : null,
    };
    if (items.length >= 1000) throw new Error('导图超过 1000 个节点，请使用源码编辑');
    items.push(item);
    stack[depth] = item;
    stack.length = depth + 1;
  }
  if (!items.length) throw new Error('请先添加中心主题，例如 - 我的主题');
  return items;
}
export function mindMapText(items: MindItem[]) {
  return items
    .map((item) => `${'  '.repeat(item.depth)}- ${item.label.replace(/[\r\n]+/g, ' ')}`)
    .join('\n');
}
export function editMindMap(
  source: string,
  id: string,
  action: 'child' | 'sibling' | 'delete' | 'rename',
  label = '新节点',
) {
  const items = parseMindMap(source),
    index = items.findIndex((item) => item.id === id),
    item = items[index];
  if (!item) throw new Error('节点不存在');
  let end = index + 1;
  while (end < items.length && items[end]!.depth > item.depth) end++;
  if (action === 'rename') item.label = label;
  else if (action === 'delete') {
    if (item.depth === 0) return source;
    items.splice(index, end - index);
  } else {
    if (action === 'sibling' && item.depth === 0) return source;
    items.splice(end, 0, {
      id: 'new',
      label,
      depth: item.depth + (action === 'child' ? 1 : 0),
      parent: action === 'child' ? item.id : item.parent,
    });
  }
  return mindMapText(items);
}
export function mindMapLayout(items: MindItem[]) {
  let row = 0;
  const positions = new Map<string, { x: number; y: number }>();
  const branches = new Map<string, MindItem[]>();
  for (const item of items)
    if (item.parent) branches.set(item.parent, [...(branches.get(item.parent) ?? []), item]);
  const visit = (item: MindItem): number => {
    const children = branches.get(item.id) ?? [];
    const ys = children.map(visit),
      y = ys.length ? (ys[0]! + ys.at(-1)!) / 2 : row++ * 64;
    positions.set(item.id, { x: item.depth * 200, y });
    return y;
  };
  if (items[0]) visit(items[0]);
  return positions;
}
