import { useConfirm } from '@jarvis/ui/components/AlertDialog';
import { useRef, useState } from 'react';
import { MessageSquare, Pencil, Trash2 } from '@jarvis/ui/icons';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Input } from '@jarvis/ui/components/Input';
import { SidebarItem } from '@jarvis/ui/components/SidebarItem';
import { Spinner } from '@jarvis/ui/components/Spinner';
import type { ChatSessionMeta } from '../../../../shared/agent';

const conversationTime = (session: ChatSessionMeta) => session.lastReplyAt ?? session.updatedAt;
const dateTime = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
export function CanvasConversations({
  sessions,
  currentId,
  busy,
  select,
  rename,
  remove,
  scope = 'canvas',
}: {
  scope?: 'canvas' | 'writing';
  sessions: ChatSessionMeta[];
  currentId?: string;
  busy: boolean;
  select: (id: string) => void;
  rename: (id: string, title: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}) {
  const confirm = useConfirm();
  const label = scope === 'writing' ? '写作' : '画布';
  const [editing, setEditing] = useState('');
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  async function save(id: string) {
    if (submitting.current || !title.trim()) return;
    submitting.current = true;
    setPending(true);
    try {
      if (await rename(id, title.trim())) setEditing('');
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  async function deleteChat(s: ChatSessionMeta) {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    try {
      if (
        await confirm({
          title: `删除“${s.title}”对话？`,
          message: scope === 'writing' ? '文档缓冲区和磁盘文件会保留。' : '画布修改和资产会保留。',
          tone: 'destructive',
          confirmLabel: '删除对话',
        })
      )
        await remove(s.id);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <nav
      className="canvas-agent-history"
      aria-label={scope === 'writing' ? '当前文档对话' : '当前项目对话'}
    >
      {sessions.length === 0 ? (
        <p>还没有对话</p>
      ) : (
        [...sessions]
          .sort((a, b) => conversationTime(b) - conversationTime(a))
          .map((s) => (
            <div
              data-testid="canvas-conversation-row"
              className="canvas-conversation-row"
              key={s.id}
            >
              {editing === s.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(s.id);
                  }}
                >
                  <label className="sr-only" htmlFor="canvas-conversation-title">
                    {label}对话名称
                  </label>
                  <Input
                    id="canvas-conversation-title"
                    value={title}
                    maxLength={100}
                    required
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditing('');
                    }}
                  />
                  <Button type="submit" size="sm" loading={pending} disabled={!title.trim()}>
                    保存
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() => setEditing('')}
                  >
                    取消
                  </Button>
                </form>
              ) : (
                <SidebarItem
                  data-testid="side-link"
                  selected={currentId === s.id}
                  disabled={pending}
                  aria-current={currentId === s.id ? 'true' : undefined}
                  onClick={() => select(s.id)}
                  icon={<MessageSquare />}
                  meta={
                    s.runId ? (
                      <Spinner size="sm" aria-label="回复中" />
                    ) : (
                      <time
                        dateTime={new Date(conversationTime(s)).toISOString()}
                        title={dateTime.format(conversationTime(s))}
                        aria-label="上次对话时间"
                      >
                        {dateTime.format(conversationTime(s))}
                      </time>
                    )
                  }
                  trailing={
                    <>
                      <IconButton
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`重命名${label}对话：${s.title}`}
                        disabled={pending}
                        onClick={() => {
                          setEditing(s.id);
                          setTitle(s.title);
                        }}
                      >
                        <Pencil />
                      </IconButton>
                      <IconButton
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`删除${label}对话：${s.title}`}
                        disabled={busy || pending}
                        onClick={() => void deleteChat(s)}
                      >
                        <Trash2 />
                      </IconButton>
                    </>
                  }
                >
                  <span data-testid="canvas-conversation-summary" title={s.title}>
                    <span>{s.title}</span>
                  </span>
                </SidebarItem>
              )}
            </div>
          ))
      )}
    </nav>
  );
}
