import { execFile } from 'node:child_process';
import type {
  CalendarAccess,
  CalendarEvent,
  CalendarInfo,
  EventInput,
  EventPatch,
} from '../../../shared/agent-calendar';
import type { CalendarProvider } from './provider';

/**
 * EventKit through JavaScript for Automation: `osascript -l JavaScript` runs this script with one
 * JSON command and prints one JSON reply. No compiled helper is needed, and every account the user
 * signed in to in macOS (iCloud, Google, Exchange) is covered.
 */
export const EVENTKIT_SCRIPT = String.raw`
ObjC.import('EventKit');
ObjC.import('Foundation');
function run(argv) {
  var cmd = JSON.parse(argv[0]);
  var store = $.EKEventStore.alloc.init;
  function access() {
    var s = Number($.EKEventStore.authorizationStatusForEntityType($.EKEntityTypeEvent));
    return s === 3 ? 'granted' : s === 0 ? 'not_determined' : s === 4 ? 'write_only' : 'denied';
  }
  function str(v) { return v && !v.isNil() ? ObjC.unwrap(v) : undefined; }
  function iso(d) { return new Date(Number(d.timeIntervalSince1970) * 1000).toISOString(); }
  function date(s) { return $.NSDate.dateWithTimeIntervalSince1970(Date.parse(s) / 1000); }
  function view(e) {
    return {
      id: str(e.eventIdentifier),
      calendarId: str(e.calendar.calendarIdentifier),
      calendarName: str(e.calendar.title),
      title: str(e.title) || '',
      start: iso(e.startDate),
      end: iso(e.endDate),
      allDay: !!e.allDay,
      location: str(e.location),
      notes: str(e.notes),
    };
  }
  function find(id) {
    var e = store.eventWithIdentifier(id);
    if (!e || e.isNil()) throw new Error('日程不存在或已删除');
    return e;
  }
  function apply(e, f) {
    if (f.title !== undefined) e.title = f.title;
    if (f.start !== undefined) e.startDate = date(f.start);
    if (f.end !== undefined) e.endDate = date(f.end);
    if (f.allDay !== undefined) e.allDay = f.allDay;
    if (f.location !== undefined) e.location = f.location;
    if (f.notes !== undefined) e.notes = f.notes;
  }
  function save(e) {
    var error = Ref();
    if (!store.saveEventSpanCommitError(e, $.EKSpanThisEvent, true, error))
      throw new Error(str(error[0].localizedDescription) || '保存日程失败');
    return view(e);
  }
  if (cmd.op === 'status') return JSON.stringify({ ok: true, access: access() });
  if (cmd.op === 'request') {
    var done = false;
    var callback = function () { done = true; };
    if (store.respondsToSelector('requestFullAccessToEventsWithCompletion:'))
      store.requestFullAccessToEventsWithCompletion(callback);
    else store.requestAccessToEntityTypeCompletion($.EKEntityTypeEvent, callback);
    var until = Date.now() + 120000;
    while (!done && Date.now() < until)
      $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1));
    return JSON.stringify({ ok: true, access: access() });
  }
  if (access() !== 'granted') return JSON.stringify({ ok: false, access: access() });
  try {
    if (cmd.op === 'calendars') {
      var list = store.calendarsForEntityType($.EKEntityTypeEvent);
      var out = [];
      for (var i = 0; i < list.count; i++) {
        var c = list.objectAtIndex(i);
        out.push({ id: str(c.calendarIdentifier), name: str(c.title), writable: !!c.allowsContentModifications });
      }
      return JSON.stringify({ ok: true, value: out });
    }
    if (cmd.op === 'events') {
      var found = store.eventsMatchingPredicate(
        store.predicateForEventsWithStartDateEndDateCalendars(date(cmd.from), date(cmd.to), null),
      );
      var events = [];
      for (var j = 0; j < found.count; j++) events.push(view(found.objectAtIndex(j)));
      return JSON.stringify({ ok: true, value: events });
    }
    if (cmd.op === 'create') {
      var e = $.EKEvent.eventWithEventStore(store);
      apply(e, cmd.event);
      e.calendar = cmd.event.calendarId
        ? store.calendarWithIdentifier(cmd.event.calendarId)
        : store.defaultCalendarForNewEvents;
      if (!e.calendar || e.calendar.isNil()) throw new Error('没有这个日历');
      return JSON.stringify({ ok: true, value: save(e) });
    }
    if (cmd.op === 'update') {
      var u = find(cmd.id);
      apply(u, cmd.patch);
      return JSON.stringify({ ok: true, value: save(u) });
    }
    if (cmd.op === 'delete') {
      var d = find(cmd.id);
      var error = Ref();
      if (!store.removeEventSpanCommitError(d, $.EKSpanThisEvent, true, error))
        throw new Error(str(error[0].localizedDescription) || '删除日程失败');
      return JSON.stringify({ ok: true });
    }
    return JSON.stringify({ ok: false, error: 'unknown command' });
  } catch (err) {
    return JSON.stringify({ ok: false, error: String(err.message || err) });
  }
}`;

export type ScriptRunner = (command: Record<string, unknown>) => Promise<string>;
/** Runs the script with `osascript`; replies over 20 MB or after 2 minutes fail. */
export const osascript: ScriptRunner = (command) =>
  new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-l', 'JavaScript', '-e', EVENTKIT_SCRIPT, JSON.stringify(command)],
      { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 },
      (error, stdout) =>
        error ? reject(new Error('无法访问系统日历', { cause: error })) : resolve(stdout),
    );
  });

type Reply = { ok: boolean; value?: unknown; access?: CalendarAccess; error?: string };
const denied = '没有日历访问权限，请在“系统设置 › 隐私与安全性 › 日历”中允许 Jarvis 访问日历';

/** The macOS system calendar; covers every account signed in to Calendar.app. */
export class AppleCalendar implements CalendarProvider {
  constructor(private runner: ScriptRunner = osascript) {}
  private async send(command: Record<string, unknown>) {
    const raw = await this.runner(command);
    let reply: Reply;
    try {
      reply = JSON.parse(raw.trim());
    } catch (cause) {
      throw new Error('系统日历返回了无法识别的结果', { cause });
    }
    if (!reply.ok)
      throw new Error(
        reply.access && reply.access !== 'granted' ? denied : (reply.error ?? '日历操作失败'),
      );
    return reply;
  }
  async status() {
    try {
      const { access } = await this.send({ op: 'status' });
      return {
        provider: 'apple' as const,
        access: access ?? 'unavailable',
        ...(access && access !== 'granted' && access !== 'not_determined'
          ? { message: denied }
          : {}),
      };
    } catch (error) {
      return {
        provider: 'apple' as const,
        access: 'unavailable' as const,
        message: error instanceof Error ? error.message : '无法访问系统日历',
      };
    }
  }
  async requestAccess() {
    await this.send({ op: 'request' }).catch(() => {});
    return this.status();
  }
  async calendars() {
    return (await this.send({ op: 'calendars' })).value as CalendarInfo[];
  }
  async events(from: string, to: string) {
    const events = (await this.send({ op: 'events', from, to })).value as CalendarEvent[];
    return events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
  async create(input: EventInput) {
    return (await this.send({ op: 'create', event: input })).value as CalendarEvent;
  }
  async update(id: string, patch: EventPatch) {
    return (await this.send({ op: 'update', id, patch })).value as CalendarEvent;
  }
  async remove(id: string) {
    await this.send({ op: 'delete', id });
  }
}
