import { useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import type { ChatSession } from '../../../../shared/agent';
export function CanvasConversations({
  sessions,
  currentId,
  busy,
  select,
  rename,
  remove,
}: {
  sessions: ChatSession[];
  currentId?: string;
  busy: boolean;
  select: (id: string) => void;
  rename: (id: string, title: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
}) {
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
  async function deleteChat(s: ChatSession) {
    if (submitting.current || !window.confirm(`删除“${s.title}”对话？画布修改和资产会保留。`))
      return;
    submitting.current = true;
    setPending(true);
    try {
      await remove(s.id);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <nav className="canvas-agent-history" aria-label="当前项目对话">
      {sessions.length === 0 ? (
        <p>还没有对话</p>
      ) : (
        sessions.map((s) => (
          <div className="canvas-conversation-row" key={s.id}>
            {editing === s.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(s.id);
                }}
              >
                <label className="sr-only" htmlFor="canvas-conversation-title">
                  画布对话名称
                </label>
                <input
                  id="canvas-conversation-title"
                  value={title}
                  maxLength={100}
                  required
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditing('');
                  }}
                />
                <button type="submit" disabled={pending || !title.trim()}>
                  保存
                </button>
                <button type="button" disabled={pending} onClick={() => setEditing('')}>
                  取消
                </button>
              </form>
            ) : (
              <>
                <button
                  className="canvas-conversation-title"
                  type="button"
                  disabled={pending}
                  aria-current={currentId === s.id ? 'true' : undefined}
                  onClick={() => select(s.id)}
                >
                  {s.title}
                  {s.runId ? ' · 回复中' : ''}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`重命名画布对话：${s.title}`}
                  onClick={() => {
                    setEditing(s.id);
                    setTitle(s.title);
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  disabled={busy || pending}
                  aria-label={`删除画布对话：${s.title}`}
                  onClick={() => void deleteChat(s)}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))
      )}
    </nav>
  );
}
