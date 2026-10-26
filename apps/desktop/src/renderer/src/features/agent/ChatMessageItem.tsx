import { useEffect, useState } from 'react';
import { Check, CircleAlert, Copy } from '@jarvis/ui/icons';
import { Button, IconButton } from '@jarvis/ui/components/Button';
import { agentValue, type ChatMessage } from '../../../../shared/agent';
import type { OsMessage } from '../../../../shared/agent-os';
import logo from '../../../../../resources/icon.png';
import {
  ChatActivity,
  type CanvasActivityActions,
  type WritingActivityActions,
} from './ChatActivity';

function replyTime(time: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - time) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return new Date(time).toLocaleDateString();
}

/** Who wrote a message that came from another Agent; the title names that conversation. */
const relayLabel: Record<NonNullable<ChatMessage['relay']>['kind'], string> = {
  handoff: '空间助手转交',
  notice: '空间任务状态',
  delegate: 'Jarvis 委派',
  message: 'Jarvis 的消息',
  task: '生成任务',
};
/** Where a non-user message in an Agent OS conversation came from. */
const sourceLabel: Record<NonNullable<OsMessage['source']>['kind'], string> = {
  coordinator: 'Jarvis 转达',
  thread: '线程',
  scheduled: '定时任务',
  external: '外部事件',
  decision: '你的选择',
  task_done: '线程状态',
  resume: '恢复',
};

export function ChatMessageItem({
  message: m,
  sessionId,
  now,
  onError,
  canvas,
  writing,
  waiting = false,
}: {
  message: ChatMessage & Pick<Partial<OsMessage>, 'source'>;
  sessionId: string;
  now: number;
  onError: (message: string) => void;
  canvas?: CanvasActivityActions;
  writing?: WritingActivityActions;
  /** The conversation's round waits for a free slot under the concurrency limit. */
  waiting?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const [steering, setSteering] = useState(false);
  /** Hands this queued message to the running reply now. */
  async function steer() {
    setSteering(true);
    try {
      if (!window.desktop?.os) throw new Error('Agent 桥接不可用');
      agentValue(await window.desktop.os.steer({ sessionId, messageId: m.id }));
    } catch (error) {
      onError(error instanceof Error ? error.message : '引导失败');
    } finally {
      setSteering(false);
    }
  }
  async function copy() {
    try {
      if (!window.desktop?.os) throw new Error('Agent 桥接不可用');
      agentValue(await window.desktop.os.copyReply({ sessionId, messageId: m.id }));
      setCopied(true);
    } catch {
      onError('复制失败，请选择文字后复制');
    }
  }
  return (
    <article
      data-testid="chat-message"
      data-message-role={m.role}
      className={`chat-message ${m.role}`}
      data-status={m.status}
      aria-label={m.role === 'user' ? '用户消息' : 'Jarvis 回复'}
    >
      {m.source && (
        <small data-testid="chat-relay" className="chat-relay">
          {sourceLabel[m.source.kind]} · {m.source.title}
        </small>
      )}
      {m.relay && (
        <small data-testid="chat-relay" className="chat-relay">
          {relayLabel[m.relay.kind]} · {m.relay.title}
        </small>
      )}
      {!!m.visionAssets?.length && (
        <div
          data-testid="chat-vision-assets"
          className="chat-vision-assets"
          aria-label="已发送视觉资产"
        >
          {m.visionAssets.map((asset, index) => (
            <div key={`${asset.nodeId}-${index}`}>
              <img
                src={asset.preview}
                alt={
                  asset.kind === 'video-frame'
                    ? `${asset.name} ${asset.time?.toFixed(2)}s`
                    : asset.name
                }
                width={64}
                height={48}
              />
              <small>
                {asset.name}
                {asset.kind === 'video-frame' ? ` · ${asset.time?.toFixed(2)}s` : ''}
              </small>
            </div>
          ))}
        </div>
      )}
      {!!m.canvasReferences?.length && (
        <div data-testid="canvas-message-references" className="canvas-message-references">
          {m.canvasReferences.map((node) => (
            <Button
              variant="secondary"
              size="xs"
              key={node.id}
              disabled={!canvas}
              onClick={() => canvas?.focus([node.id])}
            >
              {node.name}
            </Button>
          ))}
        </div>
      )}
      {m.role === 'assistant' && (
        <ChatActivity
          activities={m.activities}
          canvas={canvas}
          writing={writing}
          replying={m.status === 'running'}
          onError={onError}
        />
      )}
      <div className="chat-bubble">
        <div data-testid="chat-text" className="chat-text">
          {m.text ||
            (m.status === 'running'
              ? waiting
                ? '等待中：同时回复的对话已达上限'
                : '正在等待模型回复…'
              : '未收到回复内容')}
          {m.status === 'running' && m.text && (
            <span className="chat-cursor" aria-hidden="true">
              {' '}
              ▍
            </span>
          )}
        </div>
        {m.status === 'cancelled' && (
          <small>{m.role === 'user' ? '已取消，未发送' : '已停止，部分回复已保留'}</small>
        )}
        {m.status === 'queued' && m.steer && (
          <small data-testid="chat-steer-status">将在当前步骤结束后引导回复</small>
        )}
        {m.status === 'queued' && !m.steer && (
          <small data-testid="chat-queue-status" className="chat-queued">
            排队中，当前回复结束后发送
            <Button variant="secondary" size="xs" disabled={steering} onClick={() => void steer()}>
              引导
            </Button>
          </small>
        )}
        {m.status === 'succeeded' && m.steer && (
          <small data-testid="chat-steer-status">已引导当前回复</small>
        )}
        {m.error && (
          <div className="chat-message-error">
            <CircleAlert size={14} />
            {m.error}
          </div>
        )}
      </div>
      {m.role === 'assistant' && (
        <>
          {m.status !== 'running' && (
            <div data-testid="chat-reply-meta" className="chat-reply-meta">
              {m.text && (
                <IconButton
                  variant="ghost"
                  size="icon"
                  onClick={() => void copy()}
                  aria-label={copied ? '已复制回复' : '复制回复'}
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </IconButton>
              )}
              {m.completedAt !== undefined && (
                <time
                  dateTime={new Date(m.completedAt).toISOString()}
                  title={new Date(m.completedAt).toLocaleString()}
                >
                  {replyTime(m.completedAt, now)}
                </time>
              )}
              <span className="sr-only" role="status">
                {copied ? '已复制' : ''}
              </span>
            </div>
          )}
          <img
            src={logo}
            data-testid="chat-reply-logo"
            data-replying={m.status === 'running'}
            className={`chat-reply-logo ${m.status === 'running' ? 'is-replying' : ''}`}
            alt={m.status === 'running' ? 'Jarvis 正在回复' : 'Jarvis'}
            width={28}
            height={28}
          />
        </>
      )}
    </article>
  );
}
