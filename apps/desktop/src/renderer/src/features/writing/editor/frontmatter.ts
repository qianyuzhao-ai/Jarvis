import { isMap, isScalar, parseDocument } from 'yaml';
const frontmatter = /^(\ufeff?)---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/;
export function documentIcon(content: string): string {
  const match = frontmatter.exec(content);
  if (!match) return '';
  const doc = parseDocument(match[2]!);
  const icon: unknown = doc.get('icon');
  return typeof icon === 'string' && icon.length < 32 ? icon : '';
}
export function setDocumentIcon(content: string, icon: string) {
  const match = frontmatter.exec(content);
  if (!match) {
    const bom = content.startsWith('\ufeff') ? '\ufeff' : '';
    return `${bom}---\nicon: ${JSON.stringify(icon)}\n---\n\n${content.slice(bom.length)}`;
  }
  const yaml = match[2]!,
    doc = parseDocument(yaml);
  if (doc.errors.length || (doc.contents && !isMap(doc.contents)))
    throw new Error('Frontmatter 无法安全修改，请使用源码模式');
  const node = doc.get('icon', true);
  const newline = match[0].includes('\r\n') ? '\r\n' : '\n';
  let next: string;
  if (node !== undefined) {
    if (!isScalar(node) || !node.range) throw new Error('icon 不是文本字段，请使用源码模式');
    next = yaml.slice(0, node.range[0]) + JSON.stringify(icon) + yaml.slice(node.range[1]);
  } else next = yaml + newline + `icon: ${JSON.stringify(icon)}`;
  return `${match[1]}---${newline}${next}${newline}---${content.slice(match[0].length)}`;
}
