import { NativeSelect } from '@jarvis/ui/components/NativeSelect';
import { ToggleGroup, ToggleGroupItem } from '@jarvis/ui/components/ToggleGroup';
import { ChevronRight } from '@jarvis/ui/icons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { osValue, type OsSnapshot } from '../../../../shared/agent-os';
import type { UsageAmount, UsageRange, UsageSummary } from '../../../../shared/agent-usage';
import { openThread } from '../agent/open-thread';
import { threadStatus } from '../agent/os-view';

const RANGES: { value: UsageRange; label: string }[] = [
  { value: 'today', label: '今天' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'all', label: '全部' },
];
/** Refresh after the conversations change, at most this often. */
const REFRESH_MS = 2000;

function tokenCount(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
/** Dollars when known; a dash when none of it had a price. */
function costText(cost: number | null) {
  if (cost === null) return '—';
  if (cost > 0 && cost < 0.01) return '<$0.01';
  return `$${cost.toFixed(2)}`;
}
/** Axis labels: round values without a trailing ".0". */
const axisCount = (n: number) => tokenCount(n).replace(/\.0+(?=[KM])/, '');
const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
/** An axis top of 1, 2 or 5 times a power of ten. */
function axisTop(max: number) {
  if (max <= 0) return 1000;
  const power = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 5, 10].find((m) => m * power >= max) ?? 10) * power;
}
function bucketLabel(bucket: UsageSummary['buckets'][number], now: number) {
  const d = new Date(bucket.start);
  if (bucket.unit === 'month') return `${d.getMonth() + 1} 月`;
  if (bucket.start === new Date(now).setHours(0, 0, 0, 0)) return '今天';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Settings - Usage: tokens and cost of the main agent (Coordinators) and sub-agents (threads). */
export function UsageSettings({ snapshot }: { snapshot: OsSnapshot }) {
  const [range, setRange] = useState<UsageRange>('7d');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const latest = useRef(0);
  const projects = snapshot.projects;
  const project = projectId && projects.some((p) => p.id === projectId) ? projectId : null;
  useEffect(() => {
    const os = window.desktop?.os;
    if (!os) return;
    const request = ++latest.current;
    void os
      .getUsage({ range, projectId: project })
      .then((result) => {
        if (request !== latest.current) return;
        setSummary(osValue(result));
        setError('');
      })
      .catch((failure) => {
        if (request !== latest.current) return;
        setError(failure instanceof Error ? failure.message : '读取用量失败');
      });
  }, [range, project, tick]);
  // New replies arrive as snapshot changes; refresh shortly after, not on every one.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearTimeout(timer);
  }, [snapshot]);

  const now = Date.now();
  const total = summary?.total;
  return (
    <section
      className="v1-settings mx-auto w-full max-w-175 min-w-0 px-10 pt-6 pb-10 font-sans text-body text-fg"
      aria-labelledby="usage-title"
    >
      <header className="mb-6">
        <h1 id="usage-title" className="text-title-1">
          用量与统计
        </h1>
        <p className="mt-1.5 text-body-relaxed text-fg-secondary">
          统计 Jarvis Agent 的 token 消耗。主 Agent 是各项目的协调者，子 Agent
          是它开出的线程（包括画布与写作右侧栏）。从这个版本开始记录，更早的消耗不在统计内。
        </p>
      </header>
      <div className="mb-6 flex items-center gap-3">
        <ToggleGroup
          aria-label="时间范围"
          value={range}
          onValueChange={(value) => value && setRange(value as UsageRange)}
        >
          {RANGES.map((r) => (
            <ToggleGroupItem key={r.value} value={r.value}>
              {r.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="ml-auto w-45">
          <NativeSelect
            aria-label="项目"
            value={project ?? ''}
            onChange={(e) => setProjectId(e.target.value || null)}
          >
            <option value="">全部项目</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      {error && (
        <p className="mb-4 text-subheadline text-danger" role="alert">
          {error}
        </p>
      )}
      {!summary || !total ? (
        !error && <p className="text-callout text-fg-secondary">正在读取用量…</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="总消耗"
              amount={total}
              meta={
                !total.unpricedModels
                  ? costText(total.cost)
                  : total.cost === null
                    ? `${total.unpricedModels} 个模型无价格`
                    : `${costText(total.cost)} · ${total.unpricedModels} 个模型无价格`
              }
            />
            <Stat
              label="主 Agent · 协调者"
              tone="main"
              amount={summary.coordinator}
              meta={`${percent(summary.coordinator.tokens, total.tokens)}% · ${costText(summary.coordinator.cost)}`}
            />
            <Stat
              label="子 Agent · 线程"
              tone="sub"
              amount={summary.thread}
              meta={`${percent(summary.thread.tokens, total.tokens)}% · ${costText(summary.thread.cost)}`}
            />
          </div>
          {total.tokens === 0 ? (
            <p className="rounded-panel border border-separator px-4 py-6 text-center text-callout text-fg-secondary">
              {summary.since === null
                ? '还没有用量记录。和 Jarvis 对话后，这里会按天统计消耗。'
                : '这段时间没有用量记录。'}
            </p>
          ) : (
            <>
              <DailyChart summary={summary} now={now} />
              <ModelTable models={summary.models} />
              {summary.projects.length > 0 && <ProjectShares projects={summary.projects} />}
              {summary.threads.length > 0 && (
                <TopThreads threads={summary.threads} snapshot={snapshot} now={now} />
              )}
              <p className="text-callout text-fg-tertiary">
                合计含缓存读写；“其他”是模型设置里的连接测试与图片识别检测。费用按服务商公开价格估算（美元）；自定义中转站没有价格，显示
                —。
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Dot({ tone }: { tone: 'main' | 'sub' | 'other' }) {
  return (
    <span
      aria-hidden
      className={`size-2 shrink-0 rounded-full ${tone === 'main' ? 'bg-accent' : tone === 'sub' ? 'bg-accent/40' : 'bg-fg-tertiary/50'}`}
    />
  );
}

function Legend({ tone, children }: { tone: 'main' | 'sub' | 'other'; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-fg-secondary">
      <Dot tone={tone} />
      {children}
    </span>
  );
}

function Stat({
  label,
  amount,
  meta,
  tone,
}: {
  label: string;
  amount: UsageAmount;
  meta: string;
  tone?: 'main' | 'sub';
}) {
  return (
    <div
      data-testid="usage-stat"
      aria-label={label}
      className="flex min-w-0 flex-col gap-1 rounded-panel border border-separator px-4 pt-3 pb-3.5"
    >
      <span className="flex items-center gap-1.5 text-callout text-fg-secondary">
        {tone && <Dot tone={tone} />}
        {label}
      </span>
      <strong className="text-title-2 font-normal tabular-nums">{tokenCount(amount.tokens)}</strong>
      <span className="truncate text-callout text-fg-tertiary tabular-nums">{meta}</span>
    </div>
  );
}

function Card({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-panel border border-separator">
      <header className="flex items-center gap-2 px-4 pt-3 pb-2">
        <h2 className="flex flex-1 items-center gap-2 text-headline">{title}</h2>
        {aside && (
          <div className="flex items-center gap-3 text-callout text-fg-tertiary">{aside}</div>
        )}
      </header>
      {children}
    </section>
  );
}

function DailyChart({ summary, now }: { summary: UsageSummary; now: number }) {
  const { buckets } = summary;
  const top = axisTop(Math.max(...buckets.map((b) => b.coordinator + b.thread + b.other)));
  const hasOther = buckets.some((b) => b.other > 0);
  const every = Math.ceil(buckets.length / 10);
  const height = (n: number) => `${(n / top) * 100}%`;
  return (
    <Card
      title={buckets[0]?.unit === 'month' ? '每月消耗' : '每日消耗'}
      aside={
        <>
          <Legend tone="main">主 Agent</Legend>
          <Legend tone="sub">子 Agent</Legend>
          {hasOther && <Legend tone="other">其他</Legend>}
        </>
      }
    >
      <div className="flex gap-2 px-4 pt-2 pb-3">
        <div className="flex h-30 w-9 shrink-0 flex-col items-end justify-between text-footnote text-fg-tertiary tabular-nums">
          <span className="-mt-1.5">{axisCount(top)}</span>
          <span>{axisCount(top / 2)}</span>
          <span className="-mb-1.5">0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="relative flex h-30 items-end border-b border-separator"
            role="img"
            aria-label="按时间的消耗"
          >
            <div aria-hidden className="absolute inset-x-0 top-0 border-t border-separator" />
            <div aria-hidden className="absolute inset-x-0 top-1/2 border-t border-separator" />
            {buckets.map((b) => (
              <div
                key={b.start}
                data-testid="usage-bar"
                title={`${bucketLabel(b, now)} · 主 Agent ${tokenCount(b.coordinator)} · 子 Agent ${tokenCount(b.thread)}${b.other ? ` · 其他 ${tokenCount(b.other)}` : ''}`}
                className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <div
                  className="flex w-full max-w-6 flex-col justify-end"
                  style={{ height: '100%' }}
                >
                  <div
                    className="rounded-t-small bg-accent"
                    style={{ height: height(b.coordinator) }}
                  />
                  <div className="bg-accent/40" style={{ height: height(b.thread) }} />
                  <div className="bg-fg-tertiary/50" style={{ height: height(b.other) }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex">
            {buckets.map((b, i) => (
              <span
                key={b.start}
                className={`min-w-0 flex-1 text-center text-footnote ${i === buckets.length - 1 && b.unit === 'day' ? 'text-fg' : 'text-fg-tertiary'}`}
              >
                {i % every === 0 || i === buckets.length - 1 ? bucketLabel(b, now) : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

const num = 'w-16 shrink-0 text-right tabular-nums';
function ModelTable({ models }: { models: UsageSummary['models'] }) {
  return (
    <Card title="按模型">
      <table className="w-full table-fixed border-collapse" aria-label="按模型">
        <thead>
          <tr className="text-footnote text-fg-tertiary">
            <th className="px-4 pb-1.5 text-left font-normal">模型</th>
            {['输入', '输出', '缓存', '合计'].map((h) => (
              <th key={h} className="w-18 pb-1.5 text-right font-normal">
                {h}
              </th>
            ))}
            <th className="w-19 pr-4 pb-1.5 text-right font-normal">费用</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={`${m.provider}\u0000${m.model}`} className="border-t border-separator">
              <td className="min-w-0 px-4 py-2">
                <div className="truncate">{m.model}</div>
                <div className="truncate text-callout text-fg-tertiary">{m.provider}</div>
              </td>
              <td className="text-right text-fg-secondary tabular-nums">{tokenCount(m.input)}</td>
              <td className="text-right text-fg-secondary tabular-nums">{tokenCount(m.output)}</td>
              <td className="text-right text-fg-secondary tabular-nums">{tokenCount(m.cache)}</td>
              <td className="text-right font-bold tabular-nums">{tokenCount(m.tokens)}</td>
              <td
                className={`pr-4 text-right tabular-nums ${m.cost === null ? 'text-fg-tertiary' : 'text-fg-secondary'}`}
              >
                {costText(m.cost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function ProjectShares({ projects }: { projects: UsageSummary['projects'] }) {
  const max = Math.max(...projects.map((p) => p.tokens), 1);
  return (
    <Card
      title={
        <>
          <Dot tone="main" />主 Agent · 按项目
        </>
      }
    >
      <ul aria-label="主 Agent 按项目">
        {projects.map((p) => (
          <li
            key={p.projectId}
            className="flex items-center gap-3 border-t border-separator px-4 py-2.5"
          >
            <span className="w-30 shrink-0 truncate">{p.title}</span>
            <span aria-hidden className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-fill">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${(p.tokens / max) * 100}%` }}
              />
            </span>
            <span className={num}>{tokenCount(p.tokens)}</span>
            <span
              className={`${num} ${p.cost === null ? 'text-fg-tertiary' : 'text-fg-secondary'}`}
            >
              {costText(p.cost)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TopThreads({
  threads,
  snapshot,
  now,
}: {
  threads: UsageSummary['threads'];
  snapshot: OsSnapshot;
  now: number;
}) {
  return (
    <Card
      title={
        <>
          <Dot tone="sub" />子 Agent · 消耗最多的线程
        </>
      }
      aside={`前 ${threads.length} 个`}
    >
      <ul aria-label="消耗最多的线程">
        {threads.map((t) => {
          const view = snapshot.threads.find((v) => v.id === t.threadId);
          const meta = view
            ? `${t.projectTitle} · ${threadStatus(view, !!snapshot.runs[view.id], now).label}`
            : t.projectTitle;
          const body = (
            <>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                <span className="truncate">{view?.title ?? t.title}</span>
                <span className="truncate text-callout text-fg-tertiary">{meta}</span>
              </span>
              <span className={num}>{tokenCount(t.tokens)}</span>
              <span
                className={`${num} ${t.cost === null ? 'text-fg-tertiary' : 'text-fg-secondary'}`}
              >
                {costText(t.cost)}
              </span>
              <ChevronRight
                aria-hidden
                className={`size-4 shrink-0 text-fg-tertiary ${view ? '' : 'invisible'}`}
              />
            </>
          );
          return (
            <li key={t.threadId} className="border-t border-separator">
              {view ? (
                <button
                  type="button"
                  data-testid="usage-thread"
                  className="flex w-full items-center gap-3 py-2 pr-2 pl-4 hover:bg-fill"
                  onClick={() => openThread(t.threadId)}
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-center gap-3 py-2 pr-2 pl-4">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
