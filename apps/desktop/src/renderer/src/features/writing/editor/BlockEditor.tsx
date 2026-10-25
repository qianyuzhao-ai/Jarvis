import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Fragment } from '@tiptap/pm/model';
import { TextSelection, type Transaction } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { writingLinks } from '../../../../../shared/writing-links';
import { references, assetUrl } from './references';
import { writingExtensions } from './extensions';
import { blockRanges, blockText, parse, serialize, textPatch } from './markdown/roundtrip';
import { positionToSource, sourceToPosition } from './markdown/selection';
import type { BufferView, ViewCache } from './buffer-view';
import type { DocumentSession } from '../useWriting';
import { BlockControls } from './BlockControls';
import { toast } from '@jarvis/ui/components/Toast';

export function BlockEditor({
  document,
  bufferRef,
  cache,
  onChange,
  onPosition,
  onSave,
  onSource,
  onOpenLink,
  onAsk,
}: {
  document: DocumentSession;
  bufferRef: MutableRefObject<BufferView | null>;
  cache: ViewCache;
  onChange(id: string, content: string, manualSave?: boolean): void;
  onPosition(): void;
  onSave(): void;
  onSource(): void;
  onOpenLink(target: string, newTab: boolean): void;
  onAsk(): void;
}) {
  const callbacks = useRef({ onChange, onPosition, onSave, onSource, onOpenLink });
  callbacks.current = { onChange, onPosition, onSave, onSource, onOpenLink };
  const original = useRef(document.content),
    applying = useRef(false),
    agentRun = useRef<string | null>(null),
    firstAgent = useRef<Transaction | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const [, render] = useState(0);
  const missing = useRef(new Set<string>());
  const [hovered, setHovered] = useState<number | null>(null);
  const [dropTop, setDropTop] = useState<number | null>(null);
  const [initial] = useState(() => parse(document.content).doc.toJSON());
  const editor = useEditor(
    {
      immediatelyRender: false,
      onCreate: () => render((n) => n + 1),
      extensions: [
        ...writingExtensions((source) => assetUrl(document.rootId, document.path, source)),
        references(
          (target, newTab) => callbacks.current.onOpenLink(target, newTab),
          () => missing.current,
        ),
      ],
      content: initial,
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-label': '块编辑器',
          'aria-multiline': 'true',
          class: 'writing-block-content',
          spellcheck: 'false',
        },
        handleKeyDown: (_view, event) => {
          if (event.isComposing) return false;
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            callbacks.current.onSave();
            return true;
          }
          return false;
        },
        handleClickOn: (_view, _pos, node) => {
          if (node.type.name === 'rawBlock') {
            callbacks.current.onSource();
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        if (applying.current) return;
        agentRun.current = null;
        firstAgent.current = null;
        const content = serialize(editor.state.doc),
          patch = textPatch(original.current, content);
        original.current =
          original.current.slice(0, patch.from) + patch.text + original.current.slice(patch.to);
        callbacks.current.onChange(document.id, original.current);
        render((n) => n + 1);
      },
      onSelectionUpdate: () => {
        callbacks.current.onPosition();
        render((n) => n + 1);
      },
    },
    [document.id],
  );
  const mounted = !!editor && editor.isInitialized && !editor.isDestroyed;
  useEffect(() => {
    if (!editor || !mounted) return;

    const generation = cache.generations.get(document.id) ?? 0;
    const selection = () => {
      const { from, to } = editor.state.selection;
      return from <= 1 && to >= editor.state.doc.content.size - 1 && from !== to
        ? { from: 0, to: original.current.length }
        : {
            from: positionToSource(editor.state.doc, from),
            to: positionToSource(editor.state.doc, to),
          };
    };
    const setSelection = ({ from, to }: { from: number; to: number }) => {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.between(
            editor.state.doc.resolve(sourceToPosition(editor.state.doc, from)),
            editor.state.doc.resolve(sourceToPosition(editor.state.doc, to)),
          ),
        ),
      );
    };
    const remembered = cache.selections.get(document.id);
    if (remembered) setSelection(remembered);
    const view: BufferView = {
      id: document.id,
      content: () => original.current,
      getSelection: selection,
      setSelection,
      applyExternal(content, meta = {}) {
        const next = editor.schema.nodeFromJSON(parse(content).doc.toJSON()),
          previous = editor.state.doc;
        let left = 0,
          right = 0;
        const equal = (a: number, b: number) => {
          const one = previous.child(a),
            two = next.child(b);
          return (
            one.type === two.type &&
            blockText(one) === blockText(two) &&
            one.attrs.leading === two.attrs.leading
          );
        };
        while (left < previous.childCount && left < next.childCount && equal(left, left)) left++;
        while (
          right < previous.childCount - left &&
          right < next.childCount - left &&
          equal(previous.childCount - right - 1, next.childCount - right - 1)
        )
          right++;
        let from = 0,
          to = previous.content.size;
        for (let i = 0; i < left; i++) from += previous.child(i).nodeSize;
        for (let i = 0; i < right; i++) to -= previous.child(previous.childCount - i - 1).nodeSize;
        const inserted = [];
        for (let i = left; i < next.childCount - right; i++) inserted.push(next.child(i));
        let tr = editor.state.tr;
        if (previous.childCount === next.childCount) {
          const ranges = blockRanges(previous);
          for (let i = previous.childCount - 1; i >= 0; i--) {
            if (!equal(i, i))
              tr.replaceWith(
                ranges[i]!.position,
                ranges[i]!.position + ranges[i]!.size,
                next.child(i),
              );
          }
        } else tr.replaceWith(from, to, Fragment.fromArray(inserted));
        tr.setDocAttribute('trailing', next.attrs.trailing);
        if (meta.runId) {
          if (meta.first || agentRun.current !== meta.runId) {
            tr = closeHistory(tr);
            firstAgent.current = tr;
          } else if (firstAgent.current) tr.setMeta('appendedTransaction', firstAgent.current);
          agentRun.current = meta.runId;
          tr.setMeta('writingAgentRun', meta.runId);
        } else {
          tr = closeHistory(tr);
          if (!meta.undo) tr.setMeta('addToHistory', false);
          agentRun.current = null;
        }
        applying.current = true;
        original.current = content;
        editor.view.dispatch(tr);
        applying.current = false;
        render((n) => n + 1);
      },
      agentRun: () => agentRun.current,
      finishAgent() {
        agentRun.current = null;
        firstAgent.current = null;
        editor.view.dispatch(closeHistory(editor.state.tr));
      },
      focus: () => editor.view.focus(),
      scrollTo: (offset) => {
        const position = sourceToPosition(editor.state.doc, offset);
        editor.commands.setTextSelection(position);
        editor.commands.scrollIntoView();
      },
    };
    bufferRef.current = view;
    return () => {
      cache.selections.set(document.id, selection());
      if ((cache.generations.get(document.id) ?? 0) === generation)
        cache.blocks.set(document.id, {
          state: editor.state,
          scroll: host.current?.scrollTop ?? 0,
        });
      if (bufferRef.current === view) bufferRef.current = null;
    };
  }, [editor, mounted, document.id, cache, bufferRef]);
  useEffect(() => {
    if (editor && original.current !== document.content)
      bufferRef.current?.applyExternal(document.content);
  }, [document.content, editor, bufferRef]);
  const linkKey = JSON.stringify([
    ...new Set(
      writingLinks(document.content)
        .filter((link) => link.kind === 'wiki')
        .map((link) => link.target),
    ),
  ]);
  useEffect(() => {
    if (!editor || !mounted || !window.desktop) return;
    let alive = true;
    void Promise.all(
      (JSON.parse(linkKey) as string[]).map(async (target) => {
        const result = await window.desktop!.writing.searchFiles({
          rootId: document.rootId,
          query: target.split('/').at(-1) ?? target,
        });
        const exists =
          result.ok &&
          result.value.some(
            (entry) =>
              entry.path.replace(/\.(md|markdown)$/i, '') === target ||
              entry.name.replace(/\.(md|markdown)$/i, '') === target,
          );
        return exists ? null : target;
      }),
    ).then((results) => {
      if (alive && !editor.isDestroyed) {
        missing.current = new Set(results.filter((v): v is string => v !== null));
        editor.view.dispatch(editor.state.tr.setMeta('writingReferences', true));
      }
    });
    return () => {
      alive = false;
    };
  }, [linkKey, document.rootId, editor, mounted]);
  async function upload(file: File) {
    if (!editor || !mounted || !window.desktop) return;
    if (
      !['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type) ||
      file.size > 10 * 1024 * 1024
    ) {
      toast({ title: '请选择 10 MiB 以内的 PNG、JPEG、GIF 或 WebP 图片', tone: 'error' });
      return;
    }
    const id = document.id,
      at = editor.state.selection.from;
    try {
      const result = await window.desktop.writing.saveAsset({
        rootId: document.rootId,
        documentPath: document.path,
        mime: file.type as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
        bytes: new Uint8Array(await file.arrayBuffer()),
      });
      if (!result.ok) throw new Error(result.error);
      if (editor.isDestroyed || bufferRef.current?.id !== id) return;
      editor
        .chain()
        .focus()
        .insertContentAt(Math.min(at, editor.state.doc.content.size), {
          type: 'image',
          attrs: { src: result.value },
        })
        .run();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '图片保存失败', tone: 'error' });
    }
  }
  return (
    <div
      className="writing-block-editor"
      ref={host}
      onMouseMove={(e) => {
        if (
          !editor ||
          !mounted ||
          !(e.target instanceof globalThis.Node) ||
          !editor.view.dom.contains(e.target)
        )
          return;
        const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
        const range =
          pos &&
          blockRanges(editor.state.doc).find(
            (r) => pos.pos >= r.position && pos.pos < r.position + r.size,
          );
        if (range) setHovered(range.position);
      }}
      onPasteCapture={(e) => {
        const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
        if (file) {
          e.preventDefault();
          e.stopPropagation();
          void upload(file);
        }
      }}
      onDragOver={(e) => {
        if (editor && e.dataTransfer.types.includes('application/x-jarvis-block')) {
          e.preventDefault();
          const pos = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
          if (pos)
            setDropTop(
              editor.view.coordsAtPos(pos.pos).top - editor.view.dom.getBoundingClientRect().top,
            );
        }
      }}
      onDropCapture={(e) => {
        setDropTop(null);
        const dragged = e.dataTransfer.getData('application/x-jarvis-block');
        if (dragged && editor) {
          e.preventDefault();
          e.stopPropagation();
          const from = Number(dragged),
            node = editor.state.doc.nodeAt(from);
          const target = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
          if (node && target) {
            const range = blockRanges(editor.state.doc).find(
              (r) => target.pos >= r.position && target.pos < r.position + r.size,
            );
            if (range && range.position !== from) {
              const tr = editor.state.tr.delete(from, from + node.nodeSize);
              tr.insert(tr.mapping.map(range.position), node);
              editor.view.dispatch(tr);
            }
          }
          return;
        }
        const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
        if (file) {
          e.preventDefault();
          e.stopPropagation();
          void upload(file);
        }
      }}
    >
      {editor && mounted && (
        <BlockControls
          editor={editor}
          hovered={hovered}
          ranges={blockRanges(editor.state.doc)}
          content={original.current}
          onSource={onSource}
          onOpenLink={onOpenLink}
          onAsk={onAsk}
        />
      )}
      {dropTop !== null && <div className="writing-drop-indicator" style={{ top: dropTop }} />}
      <EditorContent editor={editor} />
    </div>
  );
}
