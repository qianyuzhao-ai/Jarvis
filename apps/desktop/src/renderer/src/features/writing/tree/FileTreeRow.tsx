import { useRef, useState } from 'react';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Input } from '@jarvis/ui/components/Input';
import { Badge } from '@jarvis/ui/components/Badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@jarvis/ui/components/DropdownMenu';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileImage,
  FileMusic,
  FileVideoCamera,
  FileArchive,
  MoreHorizontal,
} from '@jarvis/ui/icons';
import { writingFileType, type WritingEntry } from '../../../../../shared/writing';

export function WritingFileIcon({ name }: { name: string }) {
  const Icon = {
    markdown: FileText,
    text: FileCode,
    image: FileImage,
    pdf: FileText,
    audio: FileMusic,
    video: FileVideoCamera,
    binary: FileArchive,
  }[writingFileType(name)];
  return <Icon size={16} />;
}
export function FileTreeRow({
  entry,
  depth,
  expanded,
  selected,
  empty,
  onOpen,
  onToggle,
  onRename,
  onAction,
  onDrop,
}: {
  entry: WritingEntry;
  depth: number;
  expanded: boolean;
  selected: boolean;
  empty: boolean;
  onOpen(newTab: boolean): void;
  onToggle(): void;
  onRename(name: string): Promise<void>;
  onAction(action: 'duplicate' | 'trash' | 'reveal' | 'move' | 'new-file' | 'new-directory'): void;
  onDrop(path: string): void;
}) {
  const [menu, setMenu] = useState(false),
    [renaming, setRenaming] = useState(false),
    [name, setName] = useState(entry.name),
    [drop, setDrop] = useState(false);
  const busy = useRef(false),
    cancelled = useRef(false);
  const folder = entry.kind === 'directory';
  const rename = () => {
    cancelled.current = false;
    setName(entry.name);
    setRenaming(true);
  };
  const finish = async () => {
    if (busy.current || cancelled.current) return;
    busy.current = true;
    try {
      if (name !== entry.name) await onRename(name);
    } finally {
      busy.current = false;
      setRenaming(false);
    }
  };
  return (
    <div
      className={`writing-tree-row ${selected ? 'selected' : ''} ${drop ? 'drop-target' : ''}`}
      style={{ paddingLeft: 6 + depth * 12 }}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(true);
      }}
    >
      {renaming ? (
        <>
          <span className="writing-chevron-slot" />
          <WritingFileIcon name={entry.name} />
          <Input
            aria-label="重命名文件"
            className="writing-rename-input"
            autoFocus
            value={name}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void finish()}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                void finish();
              }
              if (e.key === 'Escape') {
                cancelled.current = true;
                setRenaming(false);
              }
            }}
          />
        </>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="writing-tree-open"
          aria-label={entry.name}
          aria-current={selected ? 'page' : undefined}
          aria-expanded={folder ? expanded : undefined}
          draggable={!folder}
          onDragStart={(e) =>
            e.dataTransfer.setData('application/x-jarvis-writing-path', entry.path)
          }
          onDragOver={(e) => {
            if (folder && e.dataTransfer.types.includes('application/x-jarvis-writing-path')) {
              e.preventDefault();
              setDrop(true);
            }
          }}
          onDragLeave={() => setDrop(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrop(false);
            const path = e.dataTransfer.getData('application/x-jarvis-writing-path');
            if (folder && path) onDrop(path);
          }}
          onClick={(e) => (folder ? onToggle() : onOpen(e.metaKey || e.ctrlKey))}
          onAuxClick={(e) => {
            if (e.button === 1 && !folder) onOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'F2') {
              e.preventDefault();
              rename();
            }
            if (e.key === 'Delete' || ((e.metaKey || e.ctrlKey) && e.key === 'Backspace')) {
              e.preventDefault();
              onAction('trash');
            }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && !folder) {
              e.preventDefault();
              onAction('duplicate');
            }
            if (
              (e.key === 'ArrowRight' && folder && !expanded) ||
              (e.key === 'ArrowLeft' && folder && expanded)
            ) {
              e.preventDefault();
              onToggle();
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              const rows = [
                ...(e.currentTarget
                  .closest('nav')
                  ?.querySelectorAll<HTMLButtonElement>('.writing-tree-open') ?? []),
              ];
              rows[rows.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
            }
          }}
        >
          <span className="writing-chevron-slot">
            {folder && (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
          </span>
          {folder ? (
            expanded ? (
              <FolderOpen size={16} />
            ) : (
              <Folder size={16} />
            )
          ) : (
            <WritingFileIcon name={entry.name} />
          )}
          <span className="writing-tree-name">{entry.name}</span>
        </Button>
      )}
      {!folder && ['pdf', 'binary'].includes(writingFileType(entry.name)) && (
        <Badge>{entry.name.split('.').at(-1)?.toUpperCase()}</Badge>
      )}
      <DropdownMenu open={menu} onOpenChange={setMenu}>
        <DropdownMenuTrigger asChild>
          <IconButton
            className="writing-tree-more"
            variant="ghost"
            size="icon-xs"
            aria-label="更多"
          >
            <MoreHorizontal size={12} />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {folder ? (
            <>
              <DropdownMenuItem onSelect={() => onAction('new-file')}>新建文档</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction('new-directory')}>
                新建子文件夹
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onSelect={() => onOpen(true)}>在新标签页打开</DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={rename}>重命名</DropdownMenuItem>
          {!folder && (
            <>
              <DropdownMenuItem onSelect={() => onAction('move')}>移动到…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction('duplicate')}>创建副本</DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={() => onAction('reveal')}>
            {window.desktop?.platform === 'win32' ? '在资源管理器中显示' : '在访达中显示'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={folder && !empty}
            title={folder && !empty ? '文件夹不为空或尚未展开检查' : undefined}
            onSelect={() => onAction('trash')}
          >
            移到废纸篓
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
