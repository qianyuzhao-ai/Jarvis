import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor, JSONContent } from '@tiptap/core';
import {
  CandidateList,
  CandidateListLabel,
  CandidateListItem,
  CandidateListEmpty,
} from '@jarvis/ui/components/CandidateList';
import {
  Sparkles,
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Minus,
  Network,
  Workflow,
  Lightbulb,
  ChevronRight,
  Table,
  Code,
  Image,
} from '@jarvis/ui/icons';
import { filterSlashCommands, type SlashCommand } from './slash-commands';
const icons = {
  paragraph: Pilcrow,
  heading1: Heading1,
  heading2: Heading2,
  heading3: Heading3,
  bulletList: List,
  orderedList: ListOrdered,
  taskList: ListTodo,
  blockquote: Quote,
  horizontalRule: Minus,
  mindMap: Network,
  mermaid: Workflow,
  callout: Lightbulb,
  toggleBlock: ChevronRight,
  table: Table,
  codeBlock: Code,
  image: Image,
};
const paragraph = (text = ''): JSONContent => ({
  type: 'paragraph',
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});
function contentFor(id: string): JSONContent {
  if (id.startsWith('heading')) return { type: 'heading', attrs: { level: Number(id.slice(-1)) } };
  if (id === 'callout')
    return { type: id, attrs: { tone: 'note' }, content: [paragraph('写下提示内容…')] };
  if (id === 'toggleBlock')
    return { type: id, attrs: { summary: '点击展开' }, content: [paragraph('折叠内容')] };
  if (id === 'mindMap') return { type: id, attrs: { code: '- 中心主题\n  - 分支 A\n  - 分支 B' } };
  if (id === 'mermaid') return { type: id, attrs: { code: 'flowchart LR\n  A[开始] --> B[完成]' } };
  if (id === 'codeBlock')
    return {
      type: id,
      attrs: { language: 'javascript' },
      content: [{ type: 'text', text: 'const message = "Hello";' }],
    };
  if (id === 'blockquote') return { type: id, content: [paragraph()] };
  if (['bulletList', 'orderedList', 'taskList'].includes(id))
    return {
      type: id,
      content: [{ type: id === 'taskList' ? 'taskItem' : 'listItem', content: [paragraph()] }],
    };
  if (id === 'table')
    return {
      type: id,
      content: [0, 1].map((row) => ({
        type: 'tableRow',
        content: [0, 1, 2].map((column) => ({
          type: row ? 'tableCell' : 'tableHeader',
          content: [paragraph(row ? '' : `列 ${column + 1}`)],
        })),
      })),
    };
  return { type: id === 'horizontalRule' ? id : 'paragraph' };
}
export function SlashMenu({
  editor,
  onAsk,
  onImage,
}: {
  editor: Editor;
  onAsk(prompt?: string): void;
  onImage(): void;
}) {
  const selection = editor.state.selection;
  const isParagraph = selection.$from.parent.type.name === 'paragraph';
  const raw = isParagraph ? selection.$from.parent.textContent : '';
  let inTable = false;
  for (let depth = selection.$from.depth; depth > 0; depth--)
    if (['tableCell', 'tableHeader'].includes(selection.$from.node(depth).type.name))
      inTable = true;
  const query = !inTable && raw.startsWith('/') && selection.empty ? raw.slice(1) : null;
  const [activated, setActivated] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null),
    [index, setIndex] = useState(0),
    [composing, setComposing] = useState(false);
  const signature = String(
    selection.$from.parent.attrs.blockId ??
      (selection.$from.depth ? selection.$from.before() : selection.from),
  );
  const visible =
    activated && query !== null && dismissed !== signature && !composing && !editor.view.composing;
  const commands = query === null ? [] : filterSlashCommands(query);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ commands, index, visible, signature });
  current.current = { commands, index, visible, signature };
  useEffect(() => {
    setIndex(0);
    if (query === null) {
      setActivated(false);
      setDismissed(null);
    }
  }, [query]);
  useEffect(() => {
    const dom = editor.view.dom;
    const activate = () => {
      setActivated(true);
      setDismissed(null);
    };
    const input = (event: InputEvent) => {
      if (
        event.isComposing ||
        editor.view.composing ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        !event.data?.startsWith('/')
      )
        return;
      const range = editor.state.selection;
      const replacesAll = range.from === 0 && range.to === editor.state.doc.content.size;
      const empty =
        range.$from.parent.type.name === 'paragraph' &&
        (!range.$from.parent.textContent ||
          (range.from === range.$from.start() && range.to === range.$from.end()));
      if (empty || replacesAll) activate();
    };
    dom.addEventListener('beforeinput', input);
    dom.addEventListener('jarvis:slash-open', activate);
    const start = () => setComposing(true),
      end = () => setComposing(false);
    dom.addEventListener('compositionstart', start);
    dom.addEventListener('compositionend', end);
    return () => {
      dom.removeEventListener('beforeinput', input);
      dom.removeEventListener('jarvis:slash-open', activate);
      dom.removeEventListener('compositionstart', start);
      dom.removeEventListener('compositionend', end);
    };
  }, [editor]);
  useLayoutEffect(() => {
    if (!visible) return;
    const place = () => {
      const box = editor.view.coordsAtPos(editor.state.selection.$from.start());
      // Below the line when the menu's real height fits; above it only when it does not.
      const height = host.current?.offsetHeight || 400;
      setPosition({
        left: Math.max(8, Math.min(window.innerWidth - 328, box.left)),
        top:
          box.bottom + 8 + height <= window.innerHeight - 8
            ? box.bottom + 8
            : Math.max(8, box.top - 8 - height),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [editor, visible, query]);
  const choose = (command: SlashCommand) => {
    if (editor.view.composing) return;
    const { $from } = editor.state.selection;
    if ($from.parent.type.name !== 'paragraph' || !$from.parent.textContent.startsWith('/')) return;
    const from = $from.before(),
      to = from + $from.parent.nodeSize;
    if ('prompt' in command && command.prompt) {
      editor
        .chain()
        .focus()
        .deleteRange({ from: from + 1, to: to - 1 })
        .run();
      onAsk(command.prompt);
    } else if (command.id === 'image') {
      editor
        .chain()
        .focus()
        .deleteRange({ from: from + 1, to: to - 1 })
        .run();
      onImage();
    } else {
      editor.chain().focus().insertContentAt({ from, to }, contentFor(command.id)).run();
    }
    setDismissed(signature);
  };
  const chooseRef = useRef(choose);
  chooseRef.current = choose;
  useEffect(() => {
    const dom = editor.view.dom;
    const key = (event: KeyboardEvent) => {
      const state = current.current;
      if (!state.visible || event.isComposing || editor.view.composing) return;
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      if (event.key === 'Escape') setDismissed(state.signature);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp')
        setIndex((value) =>
          state.commands.length
            ? (value + (event.key === 'ArrowDown' ? 1 : -1) + state.commands.length) %
              state.commands.length
            : 0,
        );
      if (event.key === 'Enter' && state.commands[state.index])
        chooseRef.current(state.commands[state.index]!);
    };
    dom.addEventListener('keydown', key, true);
    return () => dom.removeEventListener('keydown', key, true);
  }, [editor]);
  useEffect(() => {
    host.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);
  if (!visible) return null;
  let group = '';
  return createPortal(
    <CandidateList ref={host} className="writing-slash-menu" aria-label="插入块" style={position}>
      <div className="writing-slash-items">
        {commands.map((command, i) => {
          const label = command.group !== group ? command.group : null;
          group = command.group;
          const Icon = command.id.startsWith('ai-')
            ? Sparkles
            : (icons[command.id as keyof typeof icons] ?? Pilcrow);
          return (
            <div key={command.id}>
              {label && <CandidateListLabel>{label}</CandidateListLabel>}
              <CandidateListItem
                id={`writing-slash-${command.id}`}
                aria-label={command.label}
                aria-description={command.description}
                active={i === index}
                onActive={() => setIndex(i)}
                onClick={() => choose(command)}
                media={<Icon size={18} />}
                description={command.description}
                meta={'shortcut' in command ? command.shortcut : undefined}
              >
                {command.label}
              </CandidateListItem>
            </div>
          );
        })}
        {!commands.length && (
          <CandidateListEmpty>
            没有匹配的命令
            <br />按 Esc 关闭，继续输入文字
          </CandidateListEmpty>
        )}
      </div>
      <footer>上下键选择 · 回车插入 · Esc 关闭</footer>
    </CandidateList>,
    document.body,
  );
}
