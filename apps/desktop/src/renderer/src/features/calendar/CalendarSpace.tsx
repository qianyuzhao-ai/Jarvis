import { Button } from '@jarvis/ui/components/Button';
import { useCallback, useEffect, useState } from 'react';
import { agentValue } from '../../../../shared/agent';
import type { CalendarEvent, CalendarStatus } from '../../../../shared/agent-calendar';

const DAY = 86_400_000;
const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
/** Midnight of the Monday of the week containing `date`, in local time. */
function mondayOf(date: Date) {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}
/** A local date-time as ISO 8601 with its offset, as the calendar expects. */
function isoLocal(date: Date) {
  const offset = -date.getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19);
  return `${local}${offset >= 0 ? '+' : '-'}${pad(offset / 60)}:${pad(offset % 60)}`;
}
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

/** A week of the user's calendar; Jarvis adds and changes events from the conversation. */
export function CalendarSpace({ active }: { active: boolean }) {
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const bridge = window.desktop?.agent;
  const load = useCallback(async () => {
    if (!bridge) return;
    setLoading(true);
    setError('');
    try {
      const next = agentValue(await bridge.calendarStatus());
      setStatus(next);
      if (next.access === 'granted')
        setEvents(
          agentValue(
            await bridge.calendarEvents({
              from: isoLocal(week),
              to: isoLocal(new Date(week.getTime() + 7 * DAY)),
            }),
          ),
        );
      else setEvents([]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '读取日历失败');
    } finally {
      setLoading(false);
    }
  }, [bridge, week]);
  // Jarvis may change events from a conversation; refresh while the view is shown.
  useEffect(() => {
    if (!active) return;
    void load();
    const timer = setInterval(() => void load(), 30_000);
    const focus = () => void load();
    window.addEventListener('focus', focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [active, load]);
  const days = Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * DAY));
  const today = new Date().toDateString();
  return (
    <section
      data-testid="calendar-space"
      aria-labelledby="calendar-title"
      className="mx-auto flex w-full max-w-200 flex-col gap-4 px-10 py-6"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="calendar-title" className="text-title-1">
            日历
          </h1>
          <p className="mt-1 text-subheadline text-fg-secondary">
            {status?.provider === 'apple'
              ? 'macOS 系统日历（含 iCloud、Google 等已登录账户）'
              : 'Jarvis 日历'}
            ，可以在对话中让 Jarvis 安排或调整日程。
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeek(new Date(week.getTime() - 7 * DAY))}
          >
            上一周
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeek(mondayOf(new Date()))}>
            本周
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setWeek(new Date(week.getTime() + 7 * DAY))}
          >
            下一周
          </Button>
          <Button variant="ghost" size="sm" disabled={loading} onClick={() => void load()}>
            刷新
          </Button>
        </div>
      </header>
      <p data-testid="calendar-range" className="text-callout text-fg-secondary">
        {days[0]?.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })} —{' '}
        {days[6]?.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}
      </p>
      {status && status.access === 'not_determined' && (
        <div className="flex items-center justify-between gap-3 rounded-control border border-separator p-3">
          <span className="text-subheadline">Jarvis 需要访问日历才能显示和安排日程。</span>
          <Button
            size="sm"
            onClick={() => bridge && void bridge.requestCalendarAccess().then(() => load())}
          >
            允许访问日历
          </Button>
        </div>
      )}
      {status && status.access !== 'granted' && status.access !== 'not_determined' && (
        <p role="alert" className="text-subheadline text-danger">
          {status.message ?? '无法访问日历'}
        </p>
      )}
      {error && (
        <p role="alert" className="text-subheadline text-danger">
          {error}
        </p>
      )}
      {status?.access === 'granted' && (
        <ol data-testid="calendar-week" className="flex flex-col">
          {days.map((day) => {
            const start = day.getTime();
            const items = events.filter(
              (e) => Date.parse(e.start) < start + DAY && Date.parse(e.end) > start,
            );
            return (
              <li
                key={start}
                data-testid="calendar-day"
                aria-label={`${day.getMonth() + 1}月${day.getDate()}日`}
                className="flex gap-4 border-b border-separator py-3"
              >
                <div
                  className={`w-20 shrink-0 text-callout ${day.toDateString() === today ? 'text-accent' : 'text-fg-secondary'}`}
                >
                  <div>{weekday[day.getDay()]}</div>
                  <div className="text-title-3">{day.getDate()}</div>
                </div>
                <ul className="flex min-w-0 flex-1 flex-col gap-2">
                  {items.length === 0 && (
                    <li className="text-subheadline text-fg-tertiary">没有日程</li>
                  )}
                  {items.map((e) => (
                    <li key={e.id} data-testid="calendar-event" className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="w-24 shrink-0 text-subheadline text-fg-secondary">
                          {e.allDay ? '全天' : `${time(e.start)}–${time(e.end)}`}
                        </span>
                        <span className="truncate text-body">{e.title}</span>
                      </div>
                      <div className="pl-26 text-footnote text-fg-tertiary">
                        {e.calendarName}
                        {e.location ? ` · ${e.location}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
