import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { writingLinks } from '../../../../../shared/writing-links';
export function references(
  open: (target: string, newTab: boolean) => void,
  missing: () => Set<string>,
) {
  return Extension.create({
    name: 'writingReferences',
    addProseMirrorPlugins: () => [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, position, parent) => {
              if (
                !node.isText ||
                parent?.type.name === 'codeBlock' ||
                node.marks.some((mark) => ['code', 'link'].includes(mark.type.name))
              )
                return;
              for (const link of writingLinks(node.text ?? ''))
                decorations.push(
                  Decoration.inline(position + link.from, position + link.to, {
                    class:
                      link.kind === 'wiki'
                        ? `writing-inline-reference ${missing().has(link.target) ? 'broken' : ''}`
                        : 'writing-inline-tag',
                    ...(link.kind === 'wiki'
                      ? { 'data-writing-target': link.target, role: 'link', tabindex: '0' }
                      : {}),
                  }),
                );
            });
            return DecorationSet.create(state.doc, decorations);
          },
          handleClick(_view, _position, event) {
            const target = (event.target as HTMLElement).closest<HTMLElement>(
              '[data-writing-target]',
            )?.dataset.writingTarget;
            if (!target) return false;
            open(target, event.metaKey || event.ctrlKey);
            return true;
          },
        },
      }),
    ],
  });
}
export function assetUrl(rootId: string, documentPath: string, source: string) {
  if (/^(https?:|data:|jarvis-writing:)/i.test(source)) return source;
  const segments = documentPath.split('/').slice(0, -1);
  for (const part of source.split('/')) {
    if (part === '..') {
      if (!segments.length) return '';
      segments.pop();
    } else if (part && part !== '.') {
      try {
        segments.push(decodeURIComponent(part));
      } catch {
        return '';
      }
    }
  }
  return `jarvis-writing://${rootId}/${encodeURIComponent(segments.join('/'))}`;
}
