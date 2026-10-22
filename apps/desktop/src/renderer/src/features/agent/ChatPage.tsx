import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, CircleAlert, FileText, Pencil, X } from 'lucide-react';
import { ChatComposer } from './ChatComposer';
import { ChatMessageItem } from './ChatMessageItem';
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
  const [atBottom, setAtBottom] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(session?.title ?? '');
  const viewport = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const following = useRef(true);
  const busy = !!session?.runId;
  const configured = !!configuration.config;
  const model = session?.model ?? (draftModel || configuration.config?.model || '');
  const last = session?.messages.at(-1);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const node = viewport.current;
    if (node && following.current) node.scrollTop = node.scrollHeight;
  }, [session?.messages.length, last?.text, last?.status]);
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
    if (!text.trim() || busy || agent.sending || snapshot.busySessionId || !configured) return;
    const value = text.trim();
    following.current = true;
    setAtBottom(true);
    if (await agent.send(value, model)) {
      setText('');
      input.current?.focus();
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
            <h1>{configured ? '今天想做些什么？' : '先添加一个模型'}</h1>
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
        ) : (
          <div className="chat-messages" role="log" aria-label="对话消息" aria-live="off">
            {session.messages.map((message) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                sessionId={session.id}
                now={now}
                onError={agent.setError}
              />
            ))}
          </div>
        )}
      </div>
      <div className="chat-dock">
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

        <ChatComposer
          agent={agent}
          text={text}
          setText={setText}
          input={input}
          model={model}
          onModel={(value) => {
            if (session) void agent.model(value);
            else setDraftModel(value);
          }}
          onSubmit={submit}
        />
      </div>
    </section>
  );
}
