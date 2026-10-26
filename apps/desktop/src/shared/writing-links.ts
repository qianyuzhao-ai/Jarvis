export type WritingLink = {
  kind: 'wiki' | 'tag';
  from: number;
  to: number;
  target: string;
  label: string;
};
/** Offsets refer to the original Markdown; code and URL fragments are not references. */
export function writingLinks(content: string): WritingLink[] {
  const masked = content
    .replace(/(^|\n)([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\2\3[^\n]*(?=\n|$)|$)/g, (s) =>
      ' '.repeat(s.length),
    )
    .replace(/(`+)[\s\S]*?\1/g, (s) => ' '.repeat(s.length));
  const result: WritingLink[] = [];
  for (const match of masked.matchAll(
    /\[\[([^\]\n|]+)(?:\|([^\]\n]+))?\]\]|(^|\s)#([\p{L}\p{N}_/-]+)/gu,
  )) {
    const wiki = !!match[1],
      from = match.index + (wiki ? 0 : (match[3]?.length ?? 0));
    result.push({
      kind: wiki ? 'wiki' : 'tag',
      from,
      to: match.index + match[0].length,
      target: (match[1] ?? match[4] ?? '').trim(),
      label: (match[2] ?? match[1] ?? match[4] ?? '').trim(),
    });
  }
  return result;
}
