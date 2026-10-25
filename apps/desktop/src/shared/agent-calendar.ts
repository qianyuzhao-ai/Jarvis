import { z } from 'zod';

/** An ISO 8601 date-time with an explicit offset, e.g. 2026-10-26T09:00:00+08:00. */
export const isoDateTime = z.iso.datetime({ offset: true });
export type CalendarAccess = 'granted' | 'not_determined' | 'denied' | 'write_only' | 'unavailable';
export type CalendarStatus = {
  /** `apple`: the macOS system calendar through EventKit; `local`: Jarvis's own calendar. */
  provider: 'apple' | 'local';
  access: CalendarAccess;
  message?: string;
};
export type CalendarInfo = { id: string; name: string; writable: boolean };
export type CalendarEvent = {
  id: string;
  calendarId: string;
  calendarName: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  notes?: string;
};
export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    start: isoDateTime,
    end: isoDateTime,
    allDay: z.boolean().default(false),
    location: z.string().max(500).optional(),
    notes: z.string().max(4000).optional(),
    calendarId: z.string().min(1).max(500).optional(),
  })
  .strict()
  .refine((e) => Date.parse(e.end) > Date.parse(e.start), '结束时间必须晚于开始时间');
export type EventInput = z.output<typeof eventInputSchema>;
export const eventPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    start: isoDateTime,
    end: isoDateTime,
    allDay: z.boolean(),
    location: z.string().max(500),
    notes: z.string().max(4000),
  })
  .partial()
  .strict();
export type EventPatch = z.output<typeof eventPatchSchema>;
export const rangeSchema = z
  .object({ from: isoDateTime, to: isoDateTime })
  .strict()
  .refine((r) => Date.parse(r.to) > Date.parse(r.from), '结束时间必须晚于开始时间')
  .refine((r) => Date.parse(r.to) - Date.parse(r.from) <= 92 * 86_400_000, '一次最多查询 92 天');
