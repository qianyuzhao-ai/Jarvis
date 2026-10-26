import { useState } from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { Button } from '@jarvis/ui/components/Button';
import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
export function TableView({ node, editor, getPos }: NodeViewProps) {
  const [wide, setWide] = useState(false);
  function focusCell(last = false) {
    const pos = getPos();
    if (pos === undefined) return false;
    if (
      !last &&
      editor.state.selection.from > pos &&
      editor.state.selection.to < pos + node.nodeSize
    )
      return true;
    let position = pos + 3;
    node.descendants((child, offset) => {
      if (child.isTextblock) {
        if (last || position === pos + 3) position = pos + offset + 2;
      }
    });
    editor.commands.setTextSelection(position);
    return true;
  }
  function align(value: string) {
    const pos = getPos();
    if (pos === undefined || !focusCell()) return;
    const selection = editor.state.selection.$from;
    let column = 0;
    for (let depth = selection.depth; depth > 0; depth--)
      if (selection.node(depth).type.name === 'tableRow') {
        column = selection.index(depth);
        break;
      }
    const tr = editor.state.tr;
    node.forEach((row, rowOffset) =>
      row.forEach((cell, cellOffset, index) => {
        if (index === column)
          tr.setNodeMarkup(pos + rowOffset + cellOffset + 2, undefined, {
            ...cell.attrs,
            align: value || null,
          });
      }),
    );
    editor.view.dispatch(tr);
  }
  return (
    <NodeViewWrapper
      className={`writing-rich-block writing-table-block ${wide ? 'is-wide' : ''}`}
      data-testid="writing-table-block"
    >
      <div className="writing-rich-toolbar" contentEditable={false}>
        <span>表格</span>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            if (focusCell()) editor.chain().focus().deleteRow().run();
          }}
        >
          删除行
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            if (focusCell()) editor.chain().focus().deleteColumn().run();
          }}
        >
          删除列
        </Button>
        <NativeSelect
          aria-label="表格列对齐"
          defaultValue=""
          onChange={(e) => align(e.target.value)}
        >
          <option value="">默认对齐</option>
          <option value="left">左对齐</option>
          <option value="center">居中</option>
          <option value="right">右对齐</option>
        </NativeSelect>
        <Button variant="ghost" size="xs" aria-pressed={wide} onClick={() => setWide(!wide)}>
          {wide ? '正文宽度' : '全宽'}
        </Button>
      </div>
      <div className="writing-table-scroll">
        <NodeViewContent<'table'> as="table" />
      </div>
      <div className="writing-rich-toolbar" contentEditable={false}>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            if (focusCell(true)) editor.chain().focus().addRowAfter().run();
          }}
        >
          + 行
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            if (focusCell(true)) editor.chain().focus().addColumnAfter().run();
          }}
        >
          + 列
        </Button>
      </div>
    </NodeViewWrapper>
  );
}
