import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CalendarEvent, EventInput, EventPatch } from '../../../shared/agent-calendar';
import { JsonFile, readJson } from '../json-file';
import type { CalendarProvider } from './provider';

const ID = 'jarvis';
const NAME = 'Jarvis 日历';
const eventSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    start: z.string(),
    end: z.string(),
    allDay: z.boolean(),
    location: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();
const fileSchema = z.object({ version: z.literal(1), events: z.array(eventSchema) }).strict();
type Stored = z.infer<typeof eventSchema>;

/** Jarvis's own calendar, a JSON file; used where the system calendar is not available. */
export class LocalCalendar implements CalendarProvider {
  private list: Stored[] = [];
  private file: JsonFile;
  private loaded?: Promise<void>;
  constructor(path: string) {
    this.file = new JsonFile(path);
  }
  private load() {
    this.loaded ??= readJson(this.file.path).then((raw) => {
      const parsed = fileSchema.safeParse(raw);
      if (parsed.success) this.list = parsed.data.events;
    });
    return this.loaded;
  }
  private view(e: Stored): CalendarEvent {
    return { ...e, calendarId: ID, calendarName: NAME };
  }
  async status() {
    return { provider: 'local' as const, access: 'granted' as const };
  }
  requestAccess() {
    return this.status();
  }
  async calendars() {
    return [{ id: ID, name: NAME, writable: true }];
  }
  async events(from: string, to: string) {
    await this.load();
    const start = Date.parse(from);
    const end = Date.parse(to);
    return this.list
      .filter((e) => Date.parse(e.start) < end && Date.parse(e.end) > start)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      .map((e) => this.view(e));
  }
  async create(input: EventInput) {
    await this.load();
    if (input.calendarId && input.calendarId !== ID) throw new Error('没有这个日历');
    const { calendarId: _, ...rest } = input;
    const event: Stored = { id: randomUUID(), ...rest };
    await this.save([...this.list, event]);
    return this.view(event);
  }
  async update(id: string, patch: EventPatch) {
    await this.load();
    const current = this.list.find((e) => e.id === id);
    if (!current) throw new Error('日程不存在或已删除');
    const next = { ...current, ...patch };
    if (Date.parse(next.end) <= Date.parse(next.start)) throw new Error('结束时间必须晚于开始时间');
    await this.save(this.list.map((e) => (e.id === id ? next : e)));
    return this.view(next);
  }
  async remove(id: string) {
    await this.load();
    if (!this.list.some((e) => e.id === id)) throw new Error('日程不存在或已删除');
    await this.save(this.list.filter((e) => e.id !== id));
  }
  private async save(list: Stored[]) {
    await this.file.write({ version: 1, events: list });
    this.list = list;
  }
}
