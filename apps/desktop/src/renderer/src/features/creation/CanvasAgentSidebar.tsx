import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ChevronLeft, History, Plus } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import { visualSource } from './canvas-vision';
import { CanvasAttachments } from './CanvasAttachments';
import { useCanvasAttachments } from './use-canvas-attachments';
import { CanvasConversations } from './CanvasConversations';
import { useAgent } from '../agent/use-agent';
import { ChatComposer } from '../agent/ChatComposer';
import { ChatMessageItem } from '../agent/ChatMessageItem';
import { canvasSnapshot } from './canvas-context';
import { prepareCanvasUndo } from './canvas-transactions';
import type { Project } from './types';
import './canvas-agent.css';

export function CanvasAgentSidebar({
  project,
  selectedIds,
  open,
  focus,
  commit,
  configure,
}: {
  project: Project;
  selectedIds: string[];
  open: boolean;
  focus: (ids: string[]) => void;
  commit: (change: (p: Project) => Project) => Promise<void>;
  configure: () => void;
}) {
  const agent = useAgent(project.id);
  const attachments = useCanvasAttachments(project, selectedIds, agent.setError);
  const [text, setText] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [width, setWidth] = useState(() =>
    Math.max(340, Math.min(560, Number(localStorage.getItem('jarvis:canvas-agent-width')) || 400)),
  );
  const resize = useRef<{ x: number; width: number } | null>(null);
  const panelWidth = Math.min(width, window.innerWidth - 360);
  const session = agent.session;
  const [history, setHistory] = useState(false);
  const [includeSelected, setIncludeSelected] = useState(true);
  const [atBottom, setAtBottom] = useState(true);
  const [now, setNow] = useState(Date.now);
  const [undoing, setUndoing] = useState(false);
  const pending = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const last = session?.messages.at(-1);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const n = viewport.current;
    if (n && following.current) n.scrollTop = n.scrollHeight;
  }, [last?.text, last?.activities?.length, last?.status, open]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (following.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  async function submit() {
    if (
      pending.current ||
      attachments.preparing ||
      attachments.blocked ||
      (!text.trim() && !attachments.images.length) ||
      agent.snapshot.busySessionId
    )
      return;
    pending.current = true;
    try {
      const references = [
        ...new Set([
          ...(includeSelected ? selectedIds : []),
          ...attachments.entries.map((e) => e.nodeId),
        ]),
      ];
      if (attachments.entries.some((e) => !project.nodes.some((n) => n.id === e.nodeId)))
        throw new Error('已添加的资产不再位于当前画布，请移除后重试');
      if (
        attachments.entries.some((e) => {
          const node = project.nodes.find((n) => n.id === e.nodeId);
          return !node || visualSource(node)?.url !== e.sourceUrl;
        })
      )
        throw new Error('已添加的资产发生变化，请移除后重新添加');
      const snapshot = await canvasSnapshot(project, references);
      following.current = true;
      if (
        await agent.send(
          text.trim() || '请分析本次发送的图片和视频帧。',
          draftModel || undefined,
          snapshot,
          attachments.images,
        )
      ) {
        setText('');
        attachments.clear();
      }
    } catch (error) {
      agent.setError(error instanceof Error ? error.message : '读取画布失败');
    } finally {
      pending.current = false;
    }
  }
  async function undo(id: string) {
    if (pending.current || agent.snapshot.busySessionId) return;
    pending.current = true;
    setUndoing(true);
    agent.setError('');
    try {
      const next = await prepareCanvasUndo(project, id);
      await commit((current) => {
        if (current !== project) throw new Error('画布已发生修改，请重试');
        return next;
      });
    } catch (error) {
      agent.setError(error instanceof Error ? error.message : '撤销失败');
    } finally {
      pending.current = false;
      setUndoing(false);
    }
  }
  const actions = {
    focus,
    undo: (id: string) => void undo(id),
    canUndo: (id: string) =>
      !undoing && !agent.snapshot.busySessionId && project.agentEdits.at(-1)?.id === id,
  };
  return (
    <div className="canvas-agent-shell" style={{ width: open ? panelWidth : 0 }}>
      <aside
        id="canvas-agent"
        className="canvas-agent"
        aria-label="画布助手"
        aria-hidden={!open}
        inert={!open}
        data-open={open}
        style={{ width: panelWidth }}
      >
        <div
          className="canvas-agent-resizer"
          role="separator"
          tabIndex={0}
          aria-label="调整画布助手宽度"
          aria-orientation="vertical"
          aria-valuenow={width}
          aria-valuemin={340}
          aria-valuemax={560}
          onPointerDown={(e) => {
            resize.current = { x: e.clientX, width };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (resize.current) {
              const value = Math.max(
                340,
                Math.min(
                  560,
                  window.innerWidth - 360,
                  resize.current.width + resize.current.x - e.clientX,
                ),
              );
              setWidth(value);
              localStorage.setItem('jarvis:canvas-agent-width', String(value));
            }
          }}
          onPointerUp={() => {
            resize.current = null;
          }}
          onPointerCancel={() => {
            resize.current = null;
          }}
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
              e.preventDefault();
              const value = Math.max(
                340,
                Math.min(560, width + (e.key === 'ArrowLeft' ? 10 : -10)),
              );
              setWidth(value);
              localStorage.setItem('jarvis:canvas-agent-width', String(value));
            }
          }}
        />
        <header className="canvas-agent-header">
          {history && (
            <IconButton label="返回当前聊天" onClick={() => setHistory(false)}>
              <ChevronLeft size={18} />
            </IconButton>
          )}
          <strong title={history ? '历史对话' : (session?.title ?? '新聊天')}>
            {history ? '历史对话' : (session?.title ?? '新聊天')}
          </strong>
          {!history && (
            <IconButton
              label="画布对话历史"
              disabled={attachments.preparing}
              onClick={() => setHistory(true)}
            >
              <History size={18} />
            </IconButton>
          )}
          <button
            type="button"
            className="canvas-agent-new-chat"
            aria-label="新建画布对话"
            disabled={attachments.preparing}
            onClick={() => {
              agent.newChat();
              setText('');
              attachments.clear();
              setHistory(false);
            }}
          >
            <Plus size={18} />
            <span>新聊天</span>
          </button>
        </header>
        {!history &&
          !!project.agentEdits.length &&
          !session?.messages.some((m) =>
            m.activities?.some((a) => a.transactionId === project.agentEdits.at(-1)?.id),
          ) && (
            <div className="canvas-agent-recovery">
              <span>最近的画布修改</span>
              <button
                type="button"
                disabled={!!agent.snapshot.busySessionId || undoing}
                onClick={() => {
                  const id = project.agentEdits.at(-1)?.id;
                  if (id) void undo(id);
                }}
              >
                撤销最近修改
              </button>
            </div>
          )}
        {history && (
          <CanvasConversations
            sessions={agent.snapshot.sessions}
            currentId={session?.id}
            busy={!!agent.snapshot.busySessionId || agent.sending || attachments.preparing}
            select={(id) => {
              if (attachments.preparing) return;
              agent.select(id);
              setText('');
              attachments.clear();
              setHistory(false);
            }}
            rename={agent.renameConversation}
            remove={agent.deleteConversation}
          />
        )}
        {agent.error && (
          <div className="agent-error" role="alert">
            {agent.error}
            <button type="button" onClick={() => agent.setError('')}>
              关闭
            </button>
          </div>
        )}
        <div
          className="canvas-agent-scroll"
          hidden={history}
          ref={viewport}
          onScroll={() => {
            const n = viewport.current;
            if (n) {
              following.current = n.scrollHeight - n.scrollTop - n.clientHeight < 64;
              setAtBottom(following.current);
            }
          }}
        >
          {!session?.messages.length ? (
            <div className="canvas-agent-welcome">
              <h2>一起整理这张画布</h2>
              <p>可以查看节点、调整提示词和参数、创建节点与连接。修改后可撤销。</p>
              <p>多选图片或视频后，点击输入框下方 + 添加。图片直接发送，视频抽取代表帧。</p>
              {!agent.configuration.config ? (
                <button className="nav-button" type="button" onClick={configure}>
                  配置模型服务
                </button>
              ) : (
                ['梳理当前画布的流程', '检查选中节点的提示词', '帮我创建一个视频节点'].map((s) => (
                  <button
                    type="button"
                    className="side-link"
                    key={s}
                    onClick={() => {
                      setText(s);
                      input.current?.focus();
                    }}
                  >
                    {s}
                  </button>
                ))
              )}
            </div>
          ) : (
            <div className="chat-messages" role="log" aria-label="画布对话消息" aria-live="off">
              {session.messages.map((m) => (
                <ChatMessageItem
                  key={m.id}
                  message={m}
                  sessionId={session.id}
                  now={now}
                  onError={agent.setError}
                  canvas={actions}
                />
              ))}
            </div>
          )}
        </div>
        <div className="canvas-agent-dock" hidden={history}>
          {!atBottom && (
            <button
              className="canvas-agent-latest"
              type="button"
              onClick={() => {
                const n = viewport.current;
                if (n) n.scrollTop = n.scrollHeight;
                following.current = true;
                setAtBottom(true);
              }}
            >
              <ArrowDown size={14} />
              回到最新
            </button>
          )}
          <div className="canvas-context-scope">
            <span>当前画布 · {project.nodes.length} 个节点</span>
            {selectedIds.length > 0 && (
              <button
                type="button"
                aria-pressed={includeSelected}
                onClick={() => setIncludeSelected(!includeSelected)}
              >
                {includeSelected ? '已引用' : '引用'} {selectedIds.length} 个选中节点
              </button>
            )}
          </div>
          <CanvasAttachments
            entries={attachments.entries}
            preparing={attachments.preparing}
            remove={attachments.remove}
            focus={focus}
          />
          <ChatComposer
            onAttach={() => void attachments.add()}
            preparing={attachments.preparing || attachments.blocked}
            hasAttachments={attachments.images.length > 0}
            agent={agent}
            text={text}
            setText={setText}
            input={input}
            model={session?.model ?? (draftModel || agent.configuration.config?.model || '')}
            onModel={(value) => {
              if (session) void agent.model(value);
              else setDraftModel(value);
            }}
            onSubmit={submit}
          />
        </div>
      </aside>
    </div>
  );
}
