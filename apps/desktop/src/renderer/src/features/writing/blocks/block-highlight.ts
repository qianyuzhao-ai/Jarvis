import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
const key = new PluginKey<DecorationSet>('writingBlockHighlight');
export const BlockHighlight = Extension.create({
  name: 'writingBlockHighlight',
  addProseMirrorPlugins: () => [
    new Plugin<DecorationSet>({
      key,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, previous, _old, state) {
          if (tr.getMeta(key) === 'clear') return DecorationSet.empty;
          if (!tr.getMeta('writingAgentRun')) return previous.map(tr.mapping, tr.doc);
          const ranges: { from: number; to: number }[] = [];
          tr.mapping.maps.forEach((map) =>
            map.forEach((_oldFrom, _oldTo, from, to) => ranges.push({ from, to })),
          );
          const decorations: Decoration[] = [];
          state.doc.forEach((node, pos) => {
            if (ranges.some((range) => pos < range.to && pos + node.nodeSize > range.from))
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: 'writing-agent-highlight',
                  'data-testid': 'writing-agent-highlight',
                }),
              );
          });
          return DecorationSet.create(state.doc, decorations);
        },
      },
      props: { decorations: (state) => key.getState(state) ?? DecorationSet.empty },
      view() {
        let timer: ReturnType<typeof setTimeout> | undefined;
        return {
          update(view, previous) {
            const next = key.getState(view.state);
            if (next === key.getState(previous) || !next?.find().length) return;
            clearTimeout(timer);
            timer = setTimeout(() => {
              if (!view.isDestroyed)
                view.dispatch(view.state.tr.setMeta(key, 'clear').setMeta('addToHistory', false));
            }, 1200);
          },
          destroy: () => clearTimeout(timer),
        };
      },
    }),
  ],
});
