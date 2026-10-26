import { useState } from 'react';
import { Badge, StatusDot } from '@jarvis/ui/components/Badge';
import { Button } from '@jarvis/ui/components/Button';
import { Input } from '@jarvis/ui/components/Input';
import { Progress } from '@jarvis/ui/components/Progress';
import { Check, ChevronRight, CircleAlert, Quote, TriangleAlert, Workflow } from '@jarvis/ui/icons';
import {
  OTHER_ANSWER,
  osValue,
  type ChecklistItem,
  type CitedMessage,
  type Decision,
  type ThreadView,
} from '../../../../shared/agent-os';
import { threadStatus } from './os-view';
import { osBridge } from './use-agent';

/**
 * A decision card. An approval for an irreversible step shows the exact call and needs the
 * user's click here; other cards list their options with one marked as recommended, and the user
 * may write their own answer instead. Nothing expires: unanswered cards wait. `compact` is the
 * sidebar form: the recommendation in one line and the options as buttons.
 */
export function DecisionCard({
  decision,
  threadTitle,
  compact = false,
  onError,
}: {
  decision: Decision;
  threadTitle?: string;
  compact?: boolean;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [other, setOther] = useState('');
  const approval = !!decision.tool || !!decision.budget;
  async function answer(option: number, text?: string) {
    setBusy(true);
    try {
      osValue(
        await osBridge().answerDecision({
          decisionId: decision.id,
          option,
          ...(text ? { text } : {}),
        }),
      );
    } catch (error) {
      onError(error instanceof Error ? error.message : '回答失败');
      setBusy(false);
    }
  }
  const order = decision.options
    .map((option, index) => ({ option, index }))
    .sort((a, b) =>
      compact
        ? Number(b.index === decision.recommended) - Number(a.index === decision.recommended)
        : Number(a.index === decision.recommended) - Number(b.index === decision.recommended),
    );
  const recommended = decision.options[decision.recommended];
  const buttons = order.map(({ option, index }) => (
    <Button
      key={option.label}
      size="sm"
      variant={index === decision.recommended ? 'default' : 'secondary'}
      disabled={busy}
      onClick={() => void answer(index)}
    >
      {option.label}
    </Button>
  ));
  const own = !approval && (
    <form
      className="os-decision-other"
      onSubmit={(event) => {
        event.preventDefault();
        if (other.trim()) void answer(OTHER_ANSWER, other.trim());
      }}
    >
      <Input
        size="sm"
        aria-label="其他答案"
        placeholder="其他答案：写下你自己的选择…"
        maxLength={500}
        value={other}
        disabled={busy}
        onChange={(e) => setOther(e.target.value)}
      />
      <Button type="submit" size="sm" variant="secondary" disabled={busy || !other.trim()}>
        回答
      </Button>
    </form>
  );
  if (compact)
    return (
      <section
        data-testid="decision-card"
        className="os-decision os-decision-compact"
        data-irreversible={decision.irreversible || undefined}
        aria-label={`决策：${decision.question}`}
      >
        <header className="os-decision-head">
          {decision.irreversible ? <TriangleAlert size={14} /> : <CircleAlert size={14} />}
          <strong>{decision.question}</strong>
          <Badge tone={decision.irreversible ? 'warning' : 'info'}>
            {decision.irreversible ? '不可逆' : '需要你决定'}
          </Badge>
        </header>
        {decision.tool && <pre className="os-decision-detail">{decision.tool.detail}</pre>}
        <span className="os-muted">
          {approval
            ? '不批准就不会执行；不会超时拒绝。'
            : `推荐「${recommended?.label ?? ''}」：${recommended?.consequence ?? ''}。等你回答期间先按推荐项准备，不会超时。`}
        </span>
        <div className="os-decision-buttons">{buttons}</div>
        {own}
      </section>
    );
  return (
    <section
      data-testid="decision-card"
      className="os-decision"
      data-irreversible={decision.irreversible || undefined}
      aria-label={`决策：${decision.question}`}
    >
      <header className="os-decision-head">
        {decision.irreversible ? <TriangleAlert size={16} /> : <CircleAlert size={16} />}
        <strong>{decision.question}</strong>
        <Badge tone={decision.irreversible ? 'warning' : 'info'}>
          {decision.irreversible ? '不可逆' : '需要你决定'}
        </Badge>
        {threadTitle && <span className="os-muted">线程 · {threadTitle}</span>}
      </header>
      {decision.tool && <pre className="os-decision-detail">{decision.tool.detail}</pre>}
      {!approval && (
        <ul className="os-decision-options">
          {decision.options.map((option, index) => (
            <li key={option.label} data-recommended={index === decision.recommended || undefined}>
              <div>
                <strong>{option.label}</strong>
                <span>{option.consequence}</span>
              </div>
              {index === decision.recommended && <Badge tone="info">推荐</Badge>}
            </li>
          ))}
        </ul>
      )}
      {own}
      <footer className="os-decision-foot">
        <span className="os-muted">
          {approval
            ? '不批准就不会执行，线程会先做其余部分；不会超时拒绝。'
            : '等你回答期间，线程先按推荐项推进可逆的部分；不会超时，也不会替你决定。'}
        </span>
        {buttons}
      </footer>
    </section>
  );
}

/** A thread under the user message that started it; opens the thread. */
export function ThreadCard({
  thread,
  running,
  onOpen,
}: {
  thread: ThreadView;
  running: boolean;
  onOpen: () => void;
}) {
  const status = threadStatus(thread, running);
  const done = thread.checklist.filter((c) => c.status === 'done').length;
  return (
    <button
      type="button"
      data-testid="thread-card"
      className="os-thread-card"
      aria-label={`打开线程：${thread.title}`}
      onClick={onOpen}
    >
      <span className="os-thread-card-title">
        <Workflow size={14} />
        <strong>{thread.title}</strong>
      </span>
      <span className="os-thread-card-meta">
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="os-muted">
          {thread.decisions.length
            ? `${thread.decisions.length} 张决策卡`
            : thread.checklist.length
              ? `${done}/${thread.checklist.length}`
              : status.meta}
        </span>
      </span>
      {status.label === '进行中' && thread.checklist.length > 0 && (
        <Progress size="small" value={done} max={thread.checklist.length} aria-label="线程进度" />
      )}
    </button>
  );
}

/** A thread's status notice in the project conversation; opens the thread. */
export function ThreadNotice({ text, onOpen }: { text: string; onOpen?: () => void }) {
  return (
    <button type="button" data-testid="thread-notice" className="os-thread-notice" onClick={onOpen}>
      <Check size={14} />
      <span>{text}</span>
      <ChevronRight size={14} />
    </button>
  );
}

/** The thread's progress list; it is overwritten as work goes on and never notifies. */
export function Checklist({ items }: { items: ChecklistItem[] }) {
  if (!items.length) return null;
  const done = items.filter((c) => c.status === 'done').length;
  return (
    <section data-testid="thread-checklist" className="os-checklist" aria-label="进度">
      <header>
        <strong>进度</strong>
        <span className="os-muted">
          {done} / {items.length}
        </span>
      </header>
      <ul>
        {items.map((item, index) => (
          <li key={`${index}-${item.text}`} data-status={item.status}>
            {item.status === 'done' ? (
              <Check size={14} />
            ) : (
              <StatusDot tone={item.status === 'doing' ? 'accent' : 'neutral'} />
            )}
            <span>{item.text}</span>
            {item.status === 'doing' && <em>进行中</em>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The user's own words a relayed brief carries, quoted by the kernel. */
export function CitedQuotes({ cited }: { cited: CitedMessage[] }) {
  return (
    <>
      {cited.map((c) => (
        <span key={c.id} className="os-cited">
          <Quote size={12} />
          你的原话：{c.text}
        </span>
      ))}
    </>
  );
}
