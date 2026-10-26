import { takeWritingAssistantRequest } from './assistant-request';
import { useEffect, useRef, useState } from 'react';
import { AssistantPanel, AssistantEmpty } from '@jarvis/ui/components/AssistantPanel';
import { Alert } from '@jarvis/ui/components/Alert';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { Sparkles, History, SquarePen, X, ChevronLeft, FileText } from '@jarvis/ui/icons';
import { useAgent } from '../agent/use-agent';
import { ChatComposer } from '../agent/ChatComposer';
import { ChatMessageItem } from '../agent/ChatMessageItem';
import { CanvasConversations } from '../creation/CanvasConversations';
import type { DocumentSession } from './useWriting';
import type { useWritingHost } from './use-writing-host';
export function WritingAgentSidebar({
  document,
  host,
  selectedParagraphs,
  configure,
  close,
}: {
  document: DocumentSession;
  host: ReturnType<typeof useWritingHost>;
  selectedParagraphs: number;
  configure: () => void;
  close: () => void;
}) {
  const scope = { rootId: document.rootId, path: document.path };
  const agent = useAgent(undefined, undefined, scope);
  const [text, setText] = useState(''),
    [model, setModel] = useState(''),
    [history, setHistory] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null),
    pending = useRef(false),
    viewport = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const last = agent.session?.messages.at(-1);
  useEffect(() => {
    const node = viewport.current;
    if (node && following.current) node.scrollTop = node.scrollHeight;
  }, [last?.text, last?.status, agent.session?.messages.length]);
  useEffect(() => {
    const consume = () => {
      if (agent.loading || pending.current) return;
      const prompt = takeWritingAssistantRequest(document.id);
      if (prompt) {
        setHistory(false);
        void submit(prompt);
      }
    };
    consume();
    window.addEventListener('jarvis:writing-assistant-request', consume);
    return () => window.removeEventListener('jarvis:writing-assistant-request', consume);
  });
  const name = document.path.split('/').at(-1) ?? document.path;
  async function submit(prompt = text) {
    if (pending.current || !prompt.trim()) return;
    pending.current = true;
    try {
      await host.snapshot(scope);
      if (await agent.send(prompt.trim(), model || undefined)) setText('');
      else setText(prompt);
    } catch (e) {
      setText(prompt);
      agent.setError(e instanceof Error ? e.message : '读取文档失败');
    } finally {
      pending.current = false;
    }
  }
  async function undo(id: string) {
    if (agent.scopeBusy) return;
    await agent.undoChange(id);
  }
  return (
    <AssistantPanel
      aria-label="写作助手"
      className="writing-agent-panel"
      title="写作助手"
      actions={
        <>
          {history && (
            <IconButton variant="ghost" aria-label="返回写作对话" onClick={() => setHistory(false)}>
              <ChevronLeft />
            </IconButton>
          )}
          <IconButton variant="ghost" aria-label="写作对话历史" onClick={() => setHistory(true)}>
            <History />
          </IconButton>
          <IconButton
            variant="ghost"
            aria-label="新建写作对话"
            onClick={() => {
              agent.newChat();
              setText('');
              setHistory(false);
            }}
          >
            <SquarePen />
          </IconButton>
          <IconButton variant="ghost" aria-label="关闭写作助手" onClick={close}>
            <X />
          </IconButton>
        </>
      }
      composer={
        !history && (
          <ChatComposer
            compact
            context={
              <span data-testid="writing-agent-context">
                <FileText size={14} />
                {name} · {selectedParagraphs ? `已选 ${selectedParagraphs} 段` : '全文'}
              </span>
            }
            agent={agent}
            text={text}
            setText={setText}
            input={input}
            model={
              agent.session
                ? (agent.session.modelId ?? '')
                : model || agent.configuration.defaultModelId || ''
            }
            onModel={(value) => {
              if (agent.session) void agent.model(value);
              else setModel(value);
            }}
            onSubmit={() => submit()}
          />
        )
      }
    >
      {agent.error && (
        <Alert tone="error" onDismiss={() => agent.setError('')}>
          {agent.error}
        </Alert>
      )}
      {history ? (
        <CanvasConversations
          scope="writing"
          sessions={agent.snapshot.sessions}
          currentId={agent.session?.id}
          busy={agent.scopeBusy}
          select={(id) => {
            agent.select(id);
            setText('');
            setHistory(false);
          }}
          rename={agent.renameConversation}
          remove={agent.deleteConversation}
        />
      ) : (
        <div
          ref={viewport}
          className="writing-agent-messages"
          onScroll={() => {
            const node = viewport.current;
            if (node)
              following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
          }}
          role="log"
          aria-label="写作对话消息"
        >
          {agent.session?.messages.length ? (
            agent.session.messages.map((message) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                waiting={agent.waiting}
                sessionId={agent.session!.id}
                now={Date.now()}
                onError={agent.setError}
                writing={{
                  undo: (id) => void undo(id),
                  canUndo: (id) => !agent.scopeBusy && host.canUndo(scope, id),
                }}
              />
            ))
          ) : (
            <AssistantEmpty
              title="写作助手"
              icon={<Sparkles size={24} />}
              suggestions={
                agent.configured ? (
                  ['把选中段落改得更口语', '为全文写一段摘要', '续写下一段'].map((s) => (
                    <Button
                      key={s}
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setText(s);
                        input.current?.focus();
                      }}
                    >
                      {s}
                    </Button>
                  ))
                ) : (
                  <Button variant="secondary" size="sm" onClick={configure}>
                    前往模型设置
                  </Button>
                )
              }
            >
              读取当前文档，帮你改写、续写、总结；每次修改都可以撤销。
            </AssistantEmpty>
          )}
        </div>
      )}
    </AssistantPanel>
  );
}
