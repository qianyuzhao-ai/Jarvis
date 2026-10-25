import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { useEffect, useRef, useState } from 'react';
import { agentValue } from '../../../../shared/agent';

const choices = [1, 2, 3, 4, 5, 6];

/** How many Agent conversations may wait on the model at once; the rest wait their turn. */
export function AgentConcurrencySettings() {
  const [value, setValue] = useState<number | null>(null);
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
      if (result.ok) setValue(result.value.concurrency);
      else {
        setError(true);
        setMessage(result.error);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  async function change(next: number) {
    const agent = window.desktop?.agent;
    if (!agent || pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    setError(false);
    const previous = value;
    setValue(next);
    try {
      setValue(agentValue(await agent.setConcurrency(next)).concurrency);
      setMessage('已保存，新的回复按此上限排队');
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
    <section className="flex flex-col gap-2" aria-labelledby="agent-concurrency-heading">
      <div className="flex min-h-13 items-center justify-between gap-4 border-b border-separator pb-3">
        <div className="min-w-0">
          <h2 id="agent-concurrency-heading" className="text-body">
            同时运行的 Agent 数
          </h2>
          <p className="mt-1 text-subheadline text-fg-secondary">
            超出上限的对话会显示“等待中”，轮到后自动继续。
          </p>
        </div>
        <div className="w-24 shrink-0">
          <NativeSelect
            aria-labelledby="agent-concurrency-heading"
            value={value ?? ''}
            disabled={busy || value === null}
            onChange={(e) => void change(Number(e.target.value))}
          >
            {value === null && <option value="">—</option>}
            {choices.map((n) => (
              <option key={n} value={n}>
                {n}
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
