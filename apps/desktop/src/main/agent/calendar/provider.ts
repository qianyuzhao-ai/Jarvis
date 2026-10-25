import type {
  CalendarEvent,
  CalendarInfo,
  CalendarStatus,
  EventInput,
  EventPatch,
} from '../../../shared/agent-calendar';

/** A calendar the main Agent and the calendar view read and change. */
export interface CalendarProvider {
  status(): Promise<CalendarStatus>;
  /** Asks the operating system for access when it has not been decided yet. */
  requestAccess(): Promise<CalendarStatus>;
  calendars(): Promise<CalendarInfo[]>;
  events(from: string, to: string): Promise<CalendarEvent[]>;
  create(input: EventInput): Promise<CalendarEvent>;
  update(id: string, patch: EventPatch): Promise<CalendarEvent>;
  remove(id: string): Promise<void>;
}
/** Events of a list that overlap a time span, all-day events included. */
export function overlapping(events: CalendarEvent[], start: string, end: string, except?: string) {
  const from = Date.parse(start);
  const to = Date.parse(end);
  return events.filter(
    (e) => e.id !== except && Date.parse(e.start) < to && Date.parse(e.end) > from,
  );
}
