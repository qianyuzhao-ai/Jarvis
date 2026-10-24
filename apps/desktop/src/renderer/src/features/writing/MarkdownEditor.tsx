import { writingHistory } from './writing-history';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, drawSelection, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, historyKeymap } from '@codemirror/commands';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { bracketMatching } from '@codemirror/language';
import { headings, livePreview, type Heading } from './markdown';

export function MarkdownEditor({
  document,
  onChange,
  onOutline,
  onPosition,
  onSave,
  source,
  viewRef,
  cache,
}: {
  document: { id: string; content: string };
  onChange: (id: string, content: string) => void;
  onOutline?: (headings: Heading[]) => void;
  onPosition: (position: number) => void;
  onSave: () => void;
  source: boolean;
  viewRef: MutableRefObject<EditorView | null>;
  cache: MutableRefObject<Map<string, { state: EditorState; scroll: number }>>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onOutline, onPosition, onSave });
  callbacks.current = { onChange, onOutline, onPosition, onSave };
  const applying = useRef(false);
  const compartment = useRef(new Compartment());
  const latest = useRef({ content: document.content, source });
  latest.current = { content: document.content, source };
  useEffect(() => {
    if (!host.current) return;
    const states = cache.current;
    const saved = states.get(document.id);
    const listener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        if (!applying.current) callbacks.current.onChange(document.id, update.state.doc.toString());
        callbacks.current.onOutline?.(headings(update.state));
      }
      if (update.selectionSet || update.viewportChanged)
        callbacks.current.onPosition(update.state.selection.main.head);
    });
    const state =
      saved?.state ??
      EditorState.create({
        doc: latest.current.content,
        extensions: [
          markdown(),
          writingHistory,
          drawSelection(),
          bracketMatching(),
          highlightActiveLine(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Markdown 编辑器', spellcheck: 'false' }),
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                callbacks.current.onSave();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...markdownKeymap,
          ]),
          compartment.current.of(latest.current.source ? [] : livePreview),
          listener,
        ],
      });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    view.scrollDOM.scrollTop = saved?.scroll ?? 0;
    callbacks.current.onOutline?.(headings(view.state));
    callbacks.current.onPosition(view.state.selection.main.head);
    return () => {
      states.set(document.id, { state: view.state, scroll: view.scrollDOM.scrollTop });
      viewRef.current = null;
      view.destroy();
    };
  }, [document.id, cache, viewRef]);
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== document.content) {
      applying.current = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: document.content } });
      applying.current = false;
    }
  }, [document.id, document.content, viewRef]);
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartment.current.reconfigure(source ? [] : livePreview),
    });
  }, [source, viewRef, document.id]);
  return <div className="writing-editor" ref={host} />;
}
