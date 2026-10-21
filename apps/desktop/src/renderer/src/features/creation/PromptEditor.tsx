import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap, placeholder as editorPlaceholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import type { PromptMention } from './prompt-mentions';
import { promptReferenceEditing } from './prompt-editor-state';
import { PromptMentionMenu } from './PromptMentionMenu';

type MentionMenu = { from: number; query: string; options: PromptMention[]; active: number };
export function PromptEditor({
  label,
  placeholder,
  value,
  disabled,
  mentions,
  onChange,
  inputRef,
}: {
  label: string;
  placeholder: string;
  value: string;
  disabled: boolean;
  mentions: PromptMention[];
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLElement | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latest = useRef({ value, disabled, mentions, onChange });
  latest.current = { value, disabled, mentions, onChange };
  const config = useRef(new Compartment());
  const applying = useRef(false);
  const menuRef = useRef<MentionMenu | null>(null);
  const [menu, setMenu] = useState<MentionMenu | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(
    null,
  );
  const dismissed = useRef('');
  const refreshRef = useRef<(() => void) | null>(null);
  const listId = useId();
  const show = useCallback((next: MentionMenu | null) => {
    menuRef.current = next;
    setMenu(next);
  }, []);
  function choose(token: string) {
    const view = viewRef.current,
      current = menuRef.current;
    if (!view || !current || latest.current.disabled) return;
    const to = view.state.selection.main.head;
    show(null);
    view.dispatch({
      changes: { from: current.from, to, insert: token + ' ' },
      selection: { anchor: current.from + token.length + 1 },
      userEvent: 'input.complete',
      scrollIntoView: true,
    });
    view.focus();
  }
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  useEffect(() => {
    if (!host.current) return;
    function measure(view: EditorView) {
      view.requestMeasure({
        key: host,
        read: (v) => {
          const current = menuRef.current;
          if (!current) return null;
          const caret = v.coordsAtPos(current.from);
          const viewport = v.scrollDOM.getBoundingClientRect();
          return caret && caret.bottom >= viewport.top && caret.top <= viewport.bottom
            ? caret
            : null;
        },
        write: (caret) => {
          const current = menuRef.current;
          if (!caret || !current) {
            setPosition(null);
            return;
          }
          const width = Math.min(320, innerWidth - 16),
            height = Math.min(240, current.options.length * 52 + 8);
          const below = caret.bottom + 4;
          setPosition({
            width,
            left: Math.max(8, Math.min(caret.left, innerWidth - width - 8)),
            top: below + height <= innerHeight - 8 ? below : Math.max(8, caret.top - height - 4),
          });
        },
      });
    }
    function refresh(view: EditorView) {
      if (
        !view.hasFocus ||
        view.composing ||
        latest.current.disabled ||
        !view.state.selection.main.empty
      ) {
        show(null);
        return;
      }
      const text = view.state.doc.toString(),
        head = view.state.selection.main.head;
      const match = /@([^\s@]*)$/.exec(text.slice(0, head));
      if (!match || /^@(?:image|video|audio)_\d+$/.test(match[0])) {
        show(null);
        return;
      }
      const from = head - match[0].length,
        query = match[1] ?? '';
      if (dismissed.current === `${from}:${head}:${text}`) {
        show(null);
        return;
      }
      const options = latest.current.mentions.filter((item) =>
        `${item.token} ${item.label} ${item.name}`.toLowerCase().includes(query.toLowerCase()),
      );
      if (!options.length) {
        show(null);
        return;
      }
      const previous = menuRef.current;
      show({
        from,
        query,
        options,
        active:
          previous?.from === from && previous.query === query
            ? Math.min(previous.active, options.length - 1)
            : 0,
      });
      measure(view);
    }
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: latest.current.value,
        extensions: [
          history(),
          promptReferenceEditing,
          EditorView.lineWrapping,
          config.current.of([
            EditorState.readOnly.of(latest.current.disabled),
            EditorView.editable.of(!latest.current.disabled),
          ]),
          editorPlaceholder(placeholder),
          EditorView.contentAttributes.of({
            'aria-label': label,
            role: 'combobox',
            'aria-autocomplete': 'list',
            'aria-haspopup': 'listbox',
            'aria-expanded': 'false',
            spellcheck: 'false',
          }),
          EditorView.domEventHandlers({
            keydown(event, v) {
              const current = menuRef.current;
              if (!current || v.composing || event.isComposing || event.keyCode === 229)
                return false;
              if (
                !['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key) ||
                (event.key === 'Enter' && event.shiftKey)
              )
                return false;
              event.preventDefault();
              event.stopPropagation();
              if (event.key === 'Escape') {
                dismissed.current = `${current.from}:${v.state.selection.main.head}:${v.state.doc.toString()}`;
                show(null);
              } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp')
                show({
                  ...current,
                  active:
                    (current.active +
                      (event.key === 'ArrowDown' ? 1 : -1) +
                      current.options.length) %
                    current.options.length,
                });
              else {
                const option = current.options[current.active];
                if (option) chooseRef.current(option.token);
              }
              return true;
            },
            compositionstart() {
              show(null);
            },
            compositionend(_event, v) {
              v.requestMeasure({ read: () => null, write: () => refresh(v) });
            },
            blur() {
              show(null);
            },
            focus() {
              dismissed.current = '';
            },
            mousedown() {
              dismissed.current = '';
            },
          }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applying.current) {
              dismissed.current = '';
              latest.current.onChange(update.state.doc.toString());
            }
            if (
              update.docChanged ||
              update.selectionSet ||
              update.focusChanged ||
              update.viewportChanged
            )
              refresh(update.view);
          }),
        ],
      }),
    });
    const composingKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) event.stopPropagation();
    };
    view.contentDOM.addEventListener('keydown', composingKey, true);
    viewRef.current = view;
    inputRef.current = view.contentDOM;
    refreshRef.current = () => refresh(view);
    const reposition = () => {
      if (menuRef.current) measure(view);
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      view.contentDOM.removeEventListener('keydown', composingKey, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      refreshRef.current = null;
      inputRef.current = null;
      viewRef.current = null;
      view.destroy();
    };
  }, [inputRef, label, placeholder, show]);
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      applying.current = true;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        annotations: Transaction.addToHistory.of(false),
      });
      applying.current = false;
    }
  }, [value]);
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: config.current.reconfigure([
        EditorState.readOnly.of(disabled),
        EditorView.editable.of(!disabled),
      ]),
    });
    if (disabled) show(null);
  }, [disabled, show]);
  useEffect(() => {
    refreshRef.current?.();
  }, [mentions]);
  useEffect(() => {
    const content = viewRef.current?.contentDOM;
    if (!content) return;
    content.setAttribute('aria-expanded', String(!!menu));
    if (menu) {
      content.setAttribute('aria-controls', listId);
      content.setAttribute('aria-activedescendant', `${listId}-${menu.active}`);
    } else {
      content.removeAttribute('aria-controls');
      content.removeAttribute('aria-activedescendant');
    }
  }, [menu, listId]);
  return (
    <div className="prompt-field">
      <div ref={host} className="prompt-code-editor" />
      {menu && position && (
        <PromptMentionMenu
          id={listId}
          options={menu.options}
          active={menu.active}
          position={position}
          onChoose={choose}
        />
      )}
    </div>
  );
}
