import { useLayoutEffect, type RefObject } from 'react';
import { CornerDownLeft, Plus, Square } from 'lucide-react';
import type { useAgent } from './use-agent';
import { ContextUsage } from './ContextUsage';
import { ModelPicker } from './ModelPicker';

export function ChatComposer({
  agent,
  text,
  setText,
  input,
  model,
  onModel,
  onSubmit,
}: {
  agent: ReturnType<typeof useAgent>;
  text: string;
  setText: (value: string) => void;
  input: RefObject<HTMLTextAreaElement | null>;
  model: string;
  onModel: (value: string) => void;
  onSubmit: () => Promise<void>;
}) {
  const busy = !!agent.session?.runId;
  const configured = !!agent.configuration.config;
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    function resize() {
      if (!node) return;
      node.style.height = '24px';
      const limit = Math.max(24, Math.min(16 * 24, innerHeight * 0.45 - 28));
      node.style.height = `${Math.min(limit, Math.max(24, node.scrollHeight))}px`;
    }
    resize();
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth !== width) {
        width = node.clientWidth;
        resize();
      }
    });
    observer.observe(node);
    window.addEventListener('resize', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [text, input]);
  return (
    <form
      className="agent-composer"
      aria-label="Agent 输入框"
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit();
      }}
    >
      <div className="composer-input-surface">
        <textarea
          ref={input}
          rows={1}
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
              void onSubmit();
            }
          }}
        />
        {busy ? (
          <button
            className="composer-send"
            type="button"
            aria-label="停止回复"
            title="停止回复"
            onClick={() => void agent.cancel()}
          >
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            className="composer-send"
            type="submit"
            aria-label="发送消息"
            title={agent.snapshot.busySessionId ? '另一个对话正在回复' : '发送消息'}
            disabled={
              !text.trim() ||
              !configured ||
              agent.loading ||
              agent.sending ||
              !!agent.snapshot.busySessionId
            }
          >
            <CornerDownLeft size={18} />
          </button>
        )}
      </div>
      <div className="composer-controls">
        <button
          type="button"
          className="composer-action"
          aria-label="添加附件（暂不支持）"
          aria-disabled="true"
          title="暂不支持附件"
        >
          <Plus size={20} />
        </button>
        <button
          type="button"
          className="composer-action composer-auto"
          aria-disabled="true"
          title="当前仅聊天，无工具执行权限"
        >
          Auto
        </button>
        <div className="composer-spacer" />
        <ModelPicker
          model={model}
          disabled={!configured || busy || agent.sending || !!agent.snapshot.busySessionId}
          onChange={onModel}
        />
        <ContextUsage
          used={agent.session?.contextTokens}
          capacity={agent.session?.contextWindow ?? agent.configuration.config?.contextWindow}
        />
      </div>
    </form>
  );
}
