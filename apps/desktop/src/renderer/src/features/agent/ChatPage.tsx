import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Circle,
  CircleAlert,
  Copy,
  FileText,
  Mic,
  Pencil,
  Plus,
  Shield,
  Square,
  X,
} from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import type { useAgent } from './use-agent';

export function ChatPage({
  agent,
  onConfigure,
}: {
  agent: ReturnType<typeof useAgent>;
  onConfigure: () => void;
}) {
  const { session, configuration, snapshot } = agent;
  const [text, setText] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [modelMenu, setModelMenu] = useState(false);
  const [modelInput, setModelInput] = useState('');
  const [contextOpen, setContextOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(session?.title ?? '');
  const [copied, setCopied] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const following = useRef(true);
  const busy = !!session?.runId;
  const configured = !!configuration.config;
  const model = session?.model ?? (draftModel || configuration.config?.model || '');
  const last = session?.messages.at(-1);
  const percent =
    session?.contextTokens !== null && session?.contextTokens !== undefined && session.contextWindow
      ? Math.min(100, Math.round((session.contextTokens / session.contextWindow) * 100))
      : null;
  useEffect(() => {
    const node = viewport.current;
    if (node && following.current) node.scrollTop = node.scrollHeight;
  }, [session?.messages.length, last?.text]);
  useEffect(() => {
    if (!input.current) return;
    input.current.style.height = '54px';
    input.current.style.height = `${Math.min(220, Math.max(54, input.current.scrollHeight))}px`;
  }, [text]);
  async function submit() {
    if (!text.trim() || busy || agent.sending || snapshot.busySessionId || !configured) return;
    const value = text.trim();
    following.current = true;
    setAtBottom(true);
    if (await agent.send(value, model)) {
      setText('');
      input.current?.focus();
    }
  }
  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
    } catch {
      agent.setError('复制失败，请选择文字后复制');
    }
  }
  const suggestions = ['梳理一份资料', '推敲一个想法', '把讨论变成计划'];
  return (
    <section className="chat-page" aria-label="首页 Chat">
      {agent.error && (
        <div className="agent-error chat-error" role="alert">
          <CircleAlert size={16} />
          <span>{agent.error}</span>
          <IconButton label="关闭错误提示" onClick={() => agent.setError('')}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {session && (
        <div className="chat-title">
          <span>{session.title}</span>
          <IconButton
            label="重命名对话"
            onClick={() => {
              setTitle(session.title);
              setRenaming(true);
            }}
          >
            <Pencil size={14} />
          </IconButton>
          {busy && (
            <span className="chat-running" role="status">
              正在回复…
            </span>
          )}
        </div>
      )}
      {renaming && (
        <form
          className="chat-rename"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim())
              void agent.rename(title.trim()).then((ok) => {
                if (ok) setRenaming(false);
              });
          }}
        >
          <label htmlFor="chat-title">对话名称</label>
          <input
            id="chat-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
          />
          <button type="submit">保存名称</button>
          <button type="button" onClick={() => setRenaming(false)}>
            取消
          </button>
        </form>
      )}
      <div
        className={`chat-scroll ${session?.messages.length ? '' : 'chat-empty-scroll'}`}
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
          <div className="chat-welcome">
            <h1>{configured ? '今天想做些什么？' : '先连接你的中转站'}</h1>
            <p>
              {configured
                ? '聊一个想法，读一份资料，或继续手头的工作。'
                : '填写 API 地址和 Key，选择模型后即可开始对话。'}
            </p>
            {!configured && (
              <button className="agent-primary" onClick={onConfigure}>
                配置模型服务
              </button>
            )}
          </div>
        ) : (
          <div className="chat-messages" role="log" aria-label="对话消息" aria-live="off">
            {session.messages.map((m, index) => (
              <article key={m.id} className={`chat-message ${m.role}`} data-status={m.status}>
                <div className="chat-speaker">
                  {m.role === 'user' ? '你' : 'Jarvis'}
                  {m.role === 'assistant' && (
                    <span>
                      {m.status === 'running'
                        ? m.text
                          ? ' · 正在回复'
                          : ' · 等待回复'
                        : m.status === 'cancelled'
                          ? ' · 已停止'
                          : m.status === 'interrupted'
                            ? ' · 已中断'
                            : m.status === 'failed'
                              ? ' · 回复中断'
                              : ''}
                    </span>
                  )}
                </div>
                <div className="chat-bubble">
                  <div className="chat-text">
                    {m.text || (m.status === 'running' ? '正在等待模型回复…' : '未收到回复内容')}
                    {m.status === 'running' && m.text && (
                      <span className="chat-cursor" aria-hidden="true">
                        {' '}
                        ▍
                      </span>
                    )}
                  </div>
                  {m.status === 'cancelled' && <small>部分回复已保留</small>}
                  {m.error && (
                    <div className="chat-message-error">
                      <CircleAlert size={14} />
                      {m.error}
                    </div>
                  )}
                  {m.role === 'assistant' && ['failed', 'interrupted'].includes(m.status) && (
                    <button
                      className="chat-copy"
                      disabled={!!snapshot.busySessionId || agent.sending}
                      onClick={() => {
                        const previous = session.messages
                          .slice(0, index)
                          .reverse()
                          .find((message) => message.role === 'user');
                        if (previous) void agent.send(previous.text, model);
                      }}
                    >
                      重新发送
                    </button>
                  )}
                  {m.role === 'assistant' && m.status !== 'running' && m.text && (
                    <button
                      className="chat-copy"
                      onClick={() => void copy(m.id, m.text)}
                      aria-label={copied === m.id ? '已复制回复' : '复制回复'}
                    >
                      <Copy size={13} />
                      {copied === m.id ? '已复制' : '复制'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {!atBottom && !!session?.messages.length && (
        <button
          className="chat-latest"
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
      <div className={`chat-dock ${session?.messages.length ? '' : 'chat-empty-dock'}`}>
        <form
          className="agent-composer"
          aria-label="Agent 输入框"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <textarea
            ref={input}
            aria-label="消息"
            value={text}
            maxLength={32000}
            placeholder={configured ? '和 Jarvis 一起工作' : '连接中转站后开始对话'}
            disabled={agent.loading || !configured}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.nativeEvent.keyCode !== 229
              ) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="composer-controls">
            <div className="composer-extra">
              <IconButton label="添加附件（首期暂不支持）" title="首期暂不支持附件" disabled>
                <Plus size={22} />
              </IconButton>
              <IconButton
                label="Agent 权限（当前仅聊天）"
                title="当前仅聊天，无工具执行权限"
                disabled
              >
                <Shield size={22} />
              </IconButton>
            </div>
            <div className="composer-spacer" />
            <div className="composer-context">
              <button
                type="button"
                className="context-ring"
                aria-label="上下文占用"
                aria-expanded={contextOpen}
                onClick={() => setContextOpen(!contextOpen)}
                title={percent === null ? '上下文占用未知' : `约 ${percent}%（上次请求）`}
              >
                <Circle size={20} />
                {percent !== null && (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray={`${percent * 0.565} 56.55`}
                      transform="rotate(-90 12 12)"
                    />
                  </svg>
                )}
              </button>
              {contextOpen && (
                <div className="composer-popover" role="status">
                  {percent === null ? (
                    '上下文容量或用量未知'
                  ) : (
                    <>
                      上次请求：{session?.contextTokens} / {session?.contextWindow} tokens
                      <br />
                      占用约 {percent}%，不含尚未发送的输入
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="composer-model">
              <button
                type="button"
                className="model-trigger"
                disabled={!configured || busy || agent.sending || !!snapshot.busySessionId}
                onClick={() => {
                  setModelMenu(!modelMenu);
                  setModelInput(model);
                }}
                aria-expanded={modelMenu}
              >
                <span>{model || '先配置模型'}</span>
                <span className="composer-thinking" title="首期暂不支持思考强度调节">
                  思考
                </span>
                <ChevronDown size={16} />
              </button>
              {modelMenu && (
                <div className="composer-popover model-popover">
                  <label htmlFor="chat-model">模型 ID</label>
                  <input
                    id="chat-model"
                    value={modelInput}
                    onChange={(e) => setModelInput(e.target.value)}
                    maxLength={200}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!modelInput.trim()) return;
                      if (session) void agent.model(modelInput.trim());
                      else setDraftModel(modelInput.trim());
                      setModelMenu(false);
                    }}
                  >
                    使用此模型
                  </button>
                  <button type="button" onClick={() => setModelMenu(false)}>
                    取消
                  </button>
                </div>
              )}
            </div>
            <IconButton label="语音输入（首期暂不支持）" title="首期暂不支持语音输入" disabled>
              <Mic size={22} />
            </IconButton>
            {busy ? (
              <button
                className="composer-send"
                type="button"
                aria-label="停止回复"
                onClick={() => void agent.cancel()}
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                className="composer-send"
                type="submit"
                aria-label="发送消息"
                disabled={
                  !text.trim() ||
                  !configured ||
                  agent.loading ||
                  agent.sending ||
                  !!snapshot.busySessionId
                }
              >
                <ArrowUp size={22} />
              </button>
            )}
          </div>
        </form>
        <div className="chat-keyboard" role="status">
          {busy
            ? '正在回复 · 停止后保留已收到的内容'
            : snapshot.busySessionId
              ? '另一个对话正在回复，请先等待或打开该对话停止'
              : 'Enter 发送 · Shift + Enter 换行'}
        </div>
        {!session?.messages.length && configured && (
          <div className="chat-suggestions">
            <small>也可以从这里开始</small>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setText(s);
                  input.current?.focus();
                }}
              >
                <FileText size={16} />
                {s}
                <ArrowUp size={14} />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
