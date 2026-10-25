import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Field, FieldLabel } from '@jarvis/ui/components/Field';
import { Input } from '@jarvis/ui/components/Input';
import { Alert } from '@jarvis/ui/components/Alert';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, Pencil, Brain } from '@jarvis/ui/icons';
import { ChatComposer } from './ChatComposer';
import { ChatMessageItem } from './ChatMessageItem';
import type { useAgent } from './use-agent';

export function ChatPage({
  agent,
  onConfigure,
}: {
  agent: ReturnType<typeof useAgent>;
  onConfigure: () => void;
}) {
  const { session, configuration } = agent;
  const [text, setText] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [atBottom, setAtBottom] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(session?.title ?? '');
  const viewport = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const following = useRef(true);
  const busy = !!session?.runId;
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
      {session && (
        <div className="chat-title">
          <span>{session.title}</span>
          <IconButton
            variant="ghost"
            size="icon-xs"
            aria-label="重命名对话"
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
          <Field controlId="chat-title" className="flex-1" orientation="horizontal">
            <FieldLabel>对话名称</FieldLabel>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              required
            />
          </Field>
          <Button type="submit" disabled={!title.trim()}>
            保存名称
          </Button>
          <Button variant="secondary" onClick={() => setRenaming(false)}>
            取消
          </Button>
        </form>
      )}
      <div
        data-testid="chat-scroll"
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
            <Brain size={40} aria-hidden="true" />
            <h1>{configured ? '今天想让 Jarvis 帮你做什么？' : '先添加一个模型'}</h1>
            <p>
              {configured
                ? '聊一个想法，读一份资料，或继续手头的工作。'
                : '填写 API 地址和 Key，选择模型后即可开始对话。'}
            </p>
            {!configured && <Button onClick={onConfigure}>前往模型设置</Button>}
            {!session?.messages.length && configured && (
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
            {session.messages.map((message) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                waiting={agent.waiting}
                sessionId={session.id}
                now={now}
                onError={agent.setError}
              />
            ))}
          </div>
        )}
      </div>
      <div data-testid="chat-dock" className="chat-dock">
        {!atBottom && !!session?.messages.length && (
          <Button
            variant="ghost"
            size="sm"
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
          </Button>
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
