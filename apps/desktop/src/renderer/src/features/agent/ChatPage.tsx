import { Button } from '@jarvis/ui/components/Button';
import { Alert } from '@jarvis/ui/components/Alert';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, FileText, Brain } from '@jarvis/ui/icons';
import type { OsMessage } from '../../../../shared/agent-os';
import { ChatComposer } from './ChatComposer';
import { ChatMessageItem } from './ChatMessageItem';
import type { useAgent } from './use-agent';

/**
 * One Agent OS conversation: a project's Coordinator or a thread. The caller supplies the header,
 * content above and below the messages (progress, decision cards), what follows a message
 * (thread cards) and messages it renders itself (thread notices).
 */
export function ChatPage({
  agent,
  onConfigure,
  header,
  before,
  after,
  renderMessage,
  afterMessage,
  placeholder,
}: {
  agent: ReturnType<typeof useAgent>;
  onConfigure: () => void;
  header?: ReactNode;
  before?: ReactNode;
  after?: ReactNode;
  /** Replaces the default rendering of a message; return undefined to keep it. */
  renderMessage?: (message: OsMessage) => ReactNode | undefined;
  afterMessage?: (message: OsMessage) => ReactNode;
  placeholder?: string;
}) {
  const { session, configuration } = agent;
  const [text, setText] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const following = useRef(true);
  const configured = agent.configured;
  const model = session
    ? (session.modelId ?? '')
    : draftModel || configuration.defaultModelId || '';
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
    if (!text.trim() || agent.sending || !configured) return;
    const value = text.trim();
    following.current = true;
    setAtBottom(true);
    if (await agent.send(value, model)) {
      setText('');
      input.current?.focus();
    }
  }
  const suggestions = ['梳理一份资料', '推敲一个想法', '把讨论变成计划'];
  const empty = !session?.messages.length && !before && !after;
  return (
    <section data-testid="chat-page" className="chat-page" aria-label="首页 Chat">
      {agent.error && (
        <Alert
          tone="error"
          className="chat-error w-auto"
          onDismiss={() => agent.setError('')}
          closeLabel="关闭错误提示"
          action={
            <Button variant="secondary" size="sm" onClick={onConfigure}>
              打开设置
            </Button>
          }
        >
          {agent.error}
        </Alert>
      )}
      {header}
      <div
        data-testid="chat-scroll"
        className={`chat-scroll ${empty ? 'chat-empty-scroll' : ''}`}
        ref={viewport}
        onScroll={() => {
          const n = viewport.current;
          if (n) {
            following.current = n.scrollHeight - n.scrollTop - n.clientHeight < 64;
            setAtBottom(following.current);
          }
        }}
      >
        {empty ? (
          <div className="chat-welcome">
            <Brain size={40} aria-hidden="true" />
            <h1>{configured ? '今天想让 Jarvis 帮你做什么？' : '先添加一个模型'}</h1>
            <p>
              {configured
                ? '说一件事，Jarvis 会分给线程去做；你可以随时离开，做完会回来告诉你。'
                : '填写 API 地址和 Key，选择模型后即可开始对话。'}
            </p>
            {!configured && <Button onClick={onConfigure}>前往模型设置</Button>}
            {configured && (
              <div className="chat-suggestions">
                <small>也可以从这里开始</small>
                {suggestions.map((s) => (
                  <Button
                    variant="ghost"
                    size="sm"
                    key={s}
                    type="button"
                    onClick={() => {
                      setText(s);
                      input.current?.focus();
                    }}
                  >
                    <FileText size={16} />
                    <span className="flex-1 text-left">{s}</span>
                    <ArrowUp size={14} className="rotate-90 text-fg-secondary" />
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="chat-messages" role="log" aria-label="对话消息" aria-live="off">
            {before}
            {session?.messages.map((message) => (
              <div key={message.id} className="os-message-group" data-role={message.role}>
                {renderMessage?.(message) ?? (
                  <ChatMessageItem
                    message={message}
                    waiting={agent.waiting}
                    sessionId={session.id}
                    now={now}
                    onError={agent.setError}
                  />
                )}
                {afterMessage?.(message)}
              </div>
            ))}
            {after}
          </div>
        )}
      </div>
      <div data-testid="chat-dock" className="chat-dock">
        {!atBottom && !empty && (
          <Button
            variant="secondary"
            size="sm"
            shape="capsule"
            className="absolute right-6 bottom-full mb-2 border border-border"
            onClick={() => {
              const n = viewport.current;
              if (n) n.scrollTop = n.scrollHeight;
              following.current = true;
              setAtBottom(true);
            }}
          >
            <ArrowDown size={14} />
            回到最新
          </Button>
        )}
        <ChatComposer
          agent={agent}
          text={text}
          setText={setText}
          input={input}
          model={model}
          placeholder={placeholder}
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
