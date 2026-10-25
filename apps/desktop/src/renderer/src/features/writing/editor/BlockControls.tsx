import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { BubbleMenu } from '@tiptap/react/menus';
import { NodeSelection } from '@tiptap/pm/state';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { CandidateList, CandidateListItem } from '@jarvis/ui/components/CandidateList';
import { Input } from '@jarvis/ui/components/Input';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@jarvis/ui/components/DropdownMenu';
import { Popover, PopoverTrigger, PopoverContent } from '@jarvis/ui/components/Popover';
import {
  Plus,
  MoreHorizontal,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Sparkles,
} from '@jarvis/ui/icons';
import type { BlockRange } from './markdown/roundtrip';
import { positionToSource } from './markdown/selection';
import type { WritingEntry } from '../../../../../shared/writing';

export function BlockControls({
  editor,
  hovered,
  ranges,
  content,
  onSource,
  onOpenLink,
  onAsk,
}: {
  editor: Editor;
  hovered: number | null;
  ranges: BlockRange[];
  content: string;
  onSource(): void;
  onOpenLink(target: string, newTab: boolean): void;
  onAsk(prompt?: string): void;
}) {
  const [menu, setMenu] = useState(false),
    [href, setHref] = useState('');
  const block =
    ranges.find((r) => r.position === hovered) ??
    ranges.find(
      (r) =>
        editor.state.selection.from >= r.position &&
        editor.state.selection.from <= r.position + r.size,
    ) ??
    ranges[0];
  const menuBlock = useRef<BlockRange | null>(null);
  const convert = (kind: string) => {
    const target = menuBlock.current ?? block;
    if (!target || target.size < 2) return;
    const chain = editor
      .chain()
      .focus()
      .setTextSelection({
        from: target.position + 1,
        to: target.position + target.size - 1,
      });
    if (kind === 'paragraph') chain.setParagraph().run();
    else if (kind === 'bulletList') chain.toggleBulletList().run();
    else if (kind === 'orderedList') chain.toggleOrderedList().run();
    else if (kind === 'taskList') chain.toggleTaskList().run();
    else if (kind === 'blockquote') chain.toggleBlockquote().run();
    else if (kind === 'codeBlock') chain.toggleCodeBlock().run();
    else chain.toggleHeading({ level: Number(kind) as 1 | 2 | 3 }).run();
  };
  const choices = [
    ['paragraph', '正文'],
    ['1', '一级标题'],
    ['2', '二级标题'],
    ['3', '三级标题'],
    ['bulletList', '无序列表'],
    ['orderedList', '有序列表'],
    ['taskList', '待办清单'],
    ['blockquote', '引用'],
    ['codeBlock', '代码块'],
  ];
  let top = 0;
  if (block && editor.view.dom.isConnected) {
    const dom = editor.view.nodeDOM(block.position);
    if (dom instanceof HTMLElement)
      top = dom.getBoundingClientRect().top - editor.view.dom.getBoundingClientRect().top;
  }
  return (
    <>
      <div className="writing-block-handle" style={{ top }}>
        <IconButton
          aria-label="在下方添加块"
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            if (!block) return;
            const node = editor.state.doc.nodeAt(block.position);
            if (node?.type.name === 'paragraph' && !node.textContent) {
              editor
                .chain()
                .focus()
                .setTextSelection(block.position + 1)
                .insertContent('/')
                .run();
              editor.view.focus();
              editor.view.dom.dispatchEvent(new Event('jarvis:slash-open'));
              return;
            }
            const at = block.position + block.size;
            editor
              .chain()
              .focus()
              .insertContentAt(at, { type: 'paragraph', content: [{ type: 'text', text: '/' }] })
              .setTextSelection(at + 2)
              .run();
            // The chain defers focus; settle the DOM caret before the next keystroke.
            editor.view.focus();
            editor.view.dom.dispatchEvent(new Event('jarvis:slash-open'));
          }}
        >
          <Plus size={14} />
        </IconButton>
        <DropdownMenu
          open={menu}
          onOpenChange={(open) => {
            if (open && block) {
              menuBlock.current = block;
              editor.view.dispatch(
                editor.state.tr.setSelection(
                  NodeSelection.create(editor.state.doc, block.position),
                ),
              );
            }
            setMenu(open);
          }}
        >
          <DropdownMenuTrigger asChild>
            <IconButton
              aria-label="块菜单"
              variant="ghost"
              size="icon-xs"
              draggable
              onDragStart={(e) => {
                if (block)
                  e.dataTransfer.setData('application/x-jarvis-block', String(block.position));
              }}
            >
              <MoreHorizontal size={14} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => onAsk()}>AI 润色</DropdownMenuItem>
            <DropdownMenuSeparator />
            {choices.map(([kind, label]) => (
              <DropdownMenuItem key={kind} onSelect={() => convert(kind!)}>
                转换为{label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onSource}>在源码中编辑</DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                if (block)
                  editor.commands.deleteRange({
                    from: block.position,
                    to: block.position + block.size,
                  });
              }}
            >
              删除块
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <BubbleMenu
        editor={editor}
        options={{ placement: 'top' }}
        shouldShow={({ state }) =>
          !state.selection.empty && !(state.selection instanceof NodeSelection)
        }
      >
        <div className="writing-bubble-menu">
          <Button variant="ghost" size="sm" onClick={() => onAsk()}>
            <Sparkles />
            AI 润色
          </Button>
          <IconButton
            aria-label="加粗"
            variant="ghost"
            size="icon-sm"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold />
          </IconButton>
          <IconButton
            aria-label="斜体"
            variant="ghost"
            size="icon-sm"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic />
          </IconButton>
          <IconButton
            aria-label="删除线"
            variant="ghost"
            size="icon-sm"
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough />
          </IconButton>
          <IconButton
            aria-label="行内代码"
            variant="ghost"
            size="icon-sm"
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code />
          </IconButton>
          <Popover>
            <PopoverTrigger asChild>
              <IconButton aria-label="编辑链接" variant="ghost" size="icon-sm">
                <Link />
              </IconButton>
            </PopoverTrigger>
            <PopoverContent>
              <Input
                aria-label="链接地址"
                placeholder="https://… 或 [[文档]]"
                value={href}
                onChange={(e) => setHref(e.target.value)}
              />
              <Button
                size="sm"
                onClick={() => {
                  if (href.startsWith('[[') && href.endsWith(']]'))
                    editor.chain().focus().insertContent(href).run();
                  else if (/^(https?:\/\/|mailto:|#)/i.test(href))
                    editor.chain().focus().setLink({ href }).run();
                }}
              >
                应用链接
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </BubbleMenu>
      <WikiCandidates editor={editor} content={content} onOpenLink={onOpenLink} />
    </>
  );
}
function WikiCandidates({
  editor,
  content,
  onOpenLink,
}: {
  editor: Editor;
  content: string;
  onOpenLink(target: string, newTab: boolean): void;
}) {
  const [entries, setEntries] = useState<WritingEntry[]>([]),
    [index, setIndex] = useState(0);
  const offset = positionToSource(editor.state.doc, editor.state.selection.from);
  const match = /\[\[([^\]\n]*)$/.exec(content.slice(Math.max(0, offset - 120), offset));
  const query = match?.[1];
  const current = useRef({ entries, index, query, offset });
  current.current = { entries, index, query, offset };
  useEffect(() => {
    if (query === undefined || editor.view.composing) {
      setEntries([]);
      return;
    }
    let active = true;
    const rootId = editor.view.dom.closest<HTMLElement>('[data-writing-root]')?.dataset.writingRoot;
    if (!rootId || !window.desktop) return;
    const timer = setTimeout(() => {
      const api = window.desktop!.writing;
      void (
        query ? api.searchFiles({ rootId, query }) : api.listDirectory({ rootId, path: '' })
      ).then((result) => {
        if (active && result.ok) {
          setEntries(
            result.value
              .filter((e) => e.kind === 'file' && /\.(md|markdown)$/i.test(e.path))
              .slice(0, 10),
          );
          setIndex(0);
        }
      });
    }, 100);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, editor]);
  const choose = (entry: WritingEntry) => {
    const length = (query?.length ?? 0) + 2;
    const to = editor.state.selection.from;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: Math.max(1, to - length), to },
        `[[${entry.path.replace(/\.(md|markdown)$/i, '')}]]`,
      )
      .run();
    setEntries([]);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || !current.current.entries.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setIndex(
          (i) =>
            (i + (event.key === 'ArrowDown' ? 1 : -1) + current.current.entries.length) %
            current.current.entries.length,
        );
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setEntries([]);
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const entry = current.current.entries[current.current.index];
        if (entry) choose(entry);
      }
    };
    const dom = editor.view.dom;
    dom.addEventListener('keydown', key, true);
    return () => dom.removeEventListener('keydown', key, true);
  });
  return entries.length ? (
    <CandidateList className="writing-wiki-candidates" aria-label="文档引用候选">
      {entries.map((entry, i) => (
        <CandidateListItem
          key={entry.path}
          id={`wiki-${i}`}
          active={i === index}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => choose(entry)}
          onDoubleClick={() => onOpenLink(entry.path, true)}
        >
          {entry.path}
        </CandidateListItem>
      ))}
    </CandidateList>
  ) : null;
}
