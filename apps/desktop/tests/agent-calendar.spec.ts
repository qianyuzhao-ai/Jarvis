import { runInNewContext } from 'node:vm';
import { expect, test } from '@playwright/test';
import { AppleCalendar, EVENTKIT_SCRIPT } from '../src/main/agent/calendar/apple';
import { LocalCalendar } from '../src/main/agent/calendar/local';
import { eventInputSchema } from '../src/shared/agent-calendar';

test('the Jarvis calendar stores, finds, changes and removes events and checks times', async () => {
  const file = test.info().outputPath('calendar.json');
  const calendar = new LocalCalendar(file);
  const a = await calendar.create(
    eventInputSchema.parse({
      title: '周会',
      start: '2026-10-26T10:00:00+08:00',
      end: '2026-10-26T11:00:00+08:00',
    }),
  );
  await calendar.create(
    eventInputSchema.parse({
      title: '午饭',
      start: '2026-10-26T12:00:00+08:00',
      end: '2026-10-26T13:00:00+08:00',
      location: '食堂',
    }),
  );
  expect(
    eventInputSchema.safeParse({
      title: 'x',
      start: '2026-10-26T12:00:00+08:00',
      end: '2026-10-26T11:00:00+08:00',
    }).success,
  ).toBe(false);
  expect(
    eventInputSchema.safeParse({ title: 'x', start: '2026-10-26 12:00', end: '2026-10-26 13:00' })
      .success,
  ).toBe(false);
  const reread = new LocalCalendar(file);
  expect(
    (await reread.events('2026-10-26T00:00:00+08:00', '2026-10-27T00:00:00+08:00')).map(
      (e) => e.title,
    ),
  ).toEqual(['周会', '午饭']);
  expect(await reread.events('2026-10-26T11:30:00+08:00', '2026-10-26T11:45:00+08:00')).toEqual([]);
  const moved = await reread.update(a.id, {
    start: '2026-10-26T14:00:00+08:00',
    end: '2026-10-26T15:00:00+08:00',
  });
  expect(moved).toMatchObject({ title: '周会', calendarName: 'Jarvis 日历' });
  await expect(reread.update(a.id, { end: '2026-10-26T13:00:00+08:00' })).rejects.toThrow(
    '结束时间',
  );
  await reread.remove(a.id);
  await expect(reread.remove(a.id)).rejects.toThrow('不存在');
  expect(
    (await reread.events('2026-10-26T00:00:00+08:00', '2026-10-27T00:00:00+08:00')).map(
      (e) => e.title,
    ),
  ).toEqual(['午饭']);
});

/** Just enough of the JXA Objective-C bridge and EventKit to run the script outside macOS. */
function fakeEventKit(status: number) {
  const wrap = (value: unknown) => ({ value, isNil: () => value === undefined || value === null });
  const date = (seconds: number) => ({ timeIntervalSince1970: seconds });
  const calendar = {
    calendarIdentifier: wrap('cal-1'),
    title: wrap('工作'),
    allowsContentModifications: true,
    isNil: () => false,
  };
  const saved: Record<string, unknown>[] = [];
  let next = 0;
  const event = () => {
    const e: Record<string, unknown> = {
      eventIdentifier: wrap(`ev-${++next}`),
      calendar,
      allDay: false,
      isNil: () => false,
    };
    return e;
  };
  const existing = Object.assign(event(), {
    title: wrap('评审'),
    startDate: date(Date.parse('2026-10-26T02:00:00Z') / 1000),
    endDate: date(Date.parse('2026-10-26T03:00:00Z') / 1000),
    location: wrap('3 楼'),
    notes: wrap(undefined),
  });
  const list = (items: unknown[]) => ({
    count: items.length,
    objectAtIndex: (i: number) => items[i],
  });
  let granted = status;
  const store = {
    respondsToSelector: () => true,
    requestFullAccessToEventsWithCompletion: (callback: () => void) => {
      granted = 3;
      callback();
    },
    calendarsForEntityType: () => list([calendar]),
    predicateForEventsWithStartDateEndDateCalendars: (from: unknown, to: unknown) => ({ from, to }),
    eventsMatchingPredicate: () => list([existing]),
    eventWithIdentifier: (id: string) => (id === 'ev-1' ? existing : { isNil: () => true }),
    defaultCalendarForNewEvents: calendar,
    calendarWithIdentifier: (id: string) => (id === 'cal-1' ? calendar : { isNil: () => true }),
    saveEventSpanCommitError: (e: Record<string, unknown>) => {
      // Values assigned from the script are plain JS strings; the bridge returns wrapped ones.
      for (const key of ['title', 'location', 'notes'])
        if (typeof e[key] === 'string') e[key] = wrap(e[key]);
      saved.push(e);
      return true;
    },
    removeEventSpanCommitError: () => true,
  };
  const $ = Object.assign(() => ({}), {
    EKEventStore: { alloc: { init: store }, authorizationStatusForEntityType: () => granted },
    EKEntityTypeEvent: 0,
    EKSpanThisEvent: 0,
    EKEvent: { eventWithEventStore: event },
    NSDate: { dateWithTimeIntervalSince1970: date, dateWithTimeIntervalSinceNow: () => date(0) },
    NSRunLoop: { currentRunLoop: { runUntilDate: () => {} } },
  });
  const ObjC = { import: () => {}, unwrap: (v: { value: unknown }) => v.value };
  const run = (command: Record<string, unknown>) =>
    Promise.resolve(
      String(
        runInNewContext(`${EVENTKIT_SCRIPT}\nrun([command])`, {
          $,
          ObjC,
          Ref: () => [],
          command: JSON.stringify(command),
        }),
      ),
    );
  return { run, saved };
}

test('the EventKit script answers status, access, calendars and events, and saves through EventKit', async () => {
  const kit = fakeEventKit(0);
  const apple = new AppleCalendar(kit.run);
  expect(await apple.status()).toEqual({ provider: 'apple', access: 'not_determined' });
  await expect(apple.calendars()).rejects.toThrow('系统设置');
  expect(await apple.requestAccess()).toEqual({ provider: 'apple', access: 'granted' });
  expect(await apple.calendars()).toEqual([{ id: 'cal-1', name: '工作', writable: true }]);
  expect(await apple.events('2026-10-26T00:00:00+08:00', '2026-10-27T00:00:00+08:00')).toEqual([
    {
      id: 'ev-1',
      calendarId: 'cal-1',
      calendarName: '工作',
      title: '评审',
      start: '2026-10-26T02:00:00.000Z',
      end: '2026-10-26T03:00:00.000Z',
      allDay: false,
      location: '3 楼',
    },
  ]);
  const created = await apple.create(
    eventInputSchema.parse({
      title: '和小王开会',
      start: '2026-10-27T15:00:00+08:00',
      end: '2026-10-27T16:00:00+08:00',
      location: '会议室 A',
    }),
  );
  expect(created).toMatchObject({
    title: '和小王开会',
    calendarId: 'cal-1',
    start: '2026-10-27T07:00:00.000Z',
    end: '2026-10-27T08:00:00.000Z',
    location: '会议室 A',
  });
  await expect(
    apple.create(
      eventInputSchema.parse({
        title: 'x',
        start: '2026-10-27T15:00:00+08:00',
        end: '2026-10-27T16:00:00+08:00',
        calendarId: 'nope',
      }),
    ),
  ).rejects.toThrow('没有这个日历');
  expect(await apple.update('ev-1', { title: '设计评审' })).toMatchObject({
    id: 'ev-1',
    title: '设计评审',
  });
  await expect(apple.update('missing', { title: 'x' })).rejects.toThrow('不存在');
  await apple.remove('ev-1');

  // Denied access stays denied, with directions to System Settings.
  const denied = new AppleCalendar(fakeEventKit(2).run);
  expect(await denied.status()).toMatchObject({
    access: 'denied',
    message: expect.stringContaining('隐私与安全性'),
  });
  await expect(
    denied.events('2026-10-26T00:00:00+08:00', '2026-10-27T00:00:00+08:00'),
  ).rejects.toThrow('系统设置');
  const broken = new AppleCalendar(async () => 'not json');
  expect(await broken.status()).toMatchObject({ access: 'unavailable' });
});
