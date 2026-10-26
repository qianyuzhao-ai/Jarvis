import {
  writingHistory,
  agentHistoryAnnotations,
  finishWritingAgent,
  lastAgentRun,
} from './writing-history';
import { Transaction } from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import type { BufferView, ViewCache } from './editor/buffer-view';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { Compartment, EditorState, StateEffect } from '@codemirror/state';
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
  bufferRef,
  viewCache,
}: {
  document: { id: string; content: string; fileType?: string };
  onChange: (id: string, content: string) => void;
  onOutline?: (headings: Heading[]) => void;
  onPosition: (position: number) => void;
  onSave: () => void;
  source: boolean;
  viewRef: MutableRefObject<EditorView | null>;
  cache: MutableRefObject<Map<string, { state: EditorState; scroll: number }>>;
  bufferRef?: MutableRefObject<BufferView | null>;
  viewCache?: ViewCache;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onOutline, onPosition, onSave });
  callbacks.current = { onChange, onOutline, onPosition, onSave };
  const currentId = useRef(document.id);
  currentId.current = document.id;
  const applying = useRef(false);
  const compartment = useRef(new Compartment());
  const latest = useRef({ content: document.content, source });
  latest.current = { content: document.content, source };
  useEffect(() => {
    if (!host.current) return;
    const states = cache.current;
    const generation = viewCache?.generations.get(document.id) ?? 0;
    const saved = states.get(document.id);
    const listener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        if (!applying.current)
          callbacks.current.onChange(currentId.current, update.state.doc.toString());
        callbacks.current.onOutline?.(headings(update.state));
      }
      if (update.selectionSet || update.viewportChanged)
        callbacks.current.onPosition(update.state.selection.main.head);
    });
    const extensions = [
      ...(document.fileType === 'text' ? [] : [markdown()]),
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
    ];
    const state =
      saved?.state.update({ effects: StateEffect.reconfigure.of(extensions) }).state ??
      EditorState.create({ doc: latest.current.content, extensions });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    const remembered = viewCache?.selections.get(document.id);
    if (remembered)
      view.dispatch({
        selection: {
          anchor: Math.min(remembered.from, view.state.doc.length),
          head: Math.min(remembered.to, view.state.doc.length),
        },
      });
    if (bufferRef)
      bufferRef.current = {
        id: document.id,
        content: () => view.state.doc.toString(),
        getSelection: () => ({
          from: view.state.selection.main.from,
          to: view.state.selection.main.to,
        }),
        setSelection: ({ from, to }) =>
          view.dispatch({
            selection: {
              anchor: Math.min(from, view.state.doc.length),
              head: Math.min(to, view.state.doc.length),
            },
          }),
        applyExternal: (content, meta = {}) => {
          applying.current = true;
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: content },
            annotations: meta.runId
              ? [
                  ...agentHistoryAnnotations(meta.runId, meta.startedAt ?? Date.now()),
                  ...(meta.first ? [isolateHistory.of('before')] : []),
                ]
              : [isolateHistory.of('full'), Transaction.userEvent.of('undo.agent')],
          });
          applying.current = false;
        },
        agentRun: () => view.state.field(lastAgentRun, false) ?? null,
        finishAgent: () =>
          view.dispatch({
            effects: finishWritingAgent.of(null),
            annotations: isolateHistory.of('after'),
          }),
        focus: () => view.focus(),
        scrollTo: (offset) =>
          view.dispatch({
            effects: EditorView.scrollIntoView(Math.min(offset, view.state.doc.length), {
              y: 'center',
            }),
          }),
      };
    view.scrollDOM.scrollTop = saved?.scroll ?? 0;
    callbacks.current.onOutline?.(headings(view.state));
    callbacks.current.onPosition(view.state.selection.main.head);
    return () => {
      viewCache?.selections.set(document.id, {
        from: view.state.selection.main.from,
        to: view.state.selection.main.to,
      });
      if (bufferRef?.current?.id === document.id) bufferRef.current = null;
      if ((viewCache?.generations.get(document.id) ?? 0) === generation)
        states.set(document.id, { state: view.state, scroll: view.scrollDOM.scrollTop });
      viewRef.current = null;
      view.destroy();
    };
  }, [document.id, document.fileType, cache, viewRef, bufferRef, viewCache]);
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
