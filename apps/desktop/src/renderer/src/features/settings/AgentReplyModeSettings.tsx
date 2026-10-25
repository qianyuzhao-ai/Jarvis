import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { useEffect, useRef, useState } from 'react';
import { agentValue } from '../../../../shared/agent';
import type { ReplyMode } from '../../../../shared/agent-settings';

const choices: [ReplyMode, string][] = [
  ['steer', '引导当前回复'],
  ['queue', '排队等待'],
];

/** What sending a message does while its conversation is still replying. */
export function AgentReplyModeSettings() {
  const [value, setValue] = useState<ReplyMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const pending = useRef(false);
  useEffect(() => {
    let active = true;
    const agent = window.desktop?.agent;
    if (!agent) return;
    void agent.getSettings().then((result) => {
      if (!active) return;
      if (result.ok) setValue(result.value.whileReplying);
      else {
        setError(true);
        setMessage(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  async function change(next: ReplyMode) {
    const agent = window.desktop?.agent;
    if (!agent || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    setError(false);
    const previous = value;
    setValue(next);
    try {
      setValue(agentValue(await agent.setReplyMode(next)).whileReplying);
      setMessage('已保存');
    } catch (failure) {
      setValue(previous);
      setError(true);
      setMessage(failure instanceof Error ? failure.message : '保存失败，请重试');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="flex flex-col gap-2" aria-labelledby="agent-reply-mode-heading">
      <div className="flex min-h-13 items-center justify-between gap-4 border-b border-separator pb-3">
        <div className="min-w-0">
          <h2 id="agent-reply-mode-heading" className="text-body">
            回复中发送消息
          </h2>
          <p className="mt-1 text-subheadline text-fg-secondary">
            引导：在当前步骤结束后把消息交给正在进行的回复。排队：等回复结束再发送，排队中的消息也可单次引导。
          </p>
        </div>
        <div className="w-36 shrink-0">
          <NativeSelect
            aria-labelledby="agent-reply-mode-heading"
            value={value ?? ''}
            disabled={busy || value === null}
            onChange={(e) => void change(e.target.value as ReplyMode)}
          >
            {value === null && <option value="">—</option>}
            {choices.map(([mode, label]) => (
              <option key={mode} value={mode}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {message && (
        <p
          role={error ? 'alert' : 'status'}
          className={error ? 'text-subheadline text-danger' : 'text-subheadline text-fg-secondary'}
        >
          {message}
        </p>
      )}
    </section>
  );
}
