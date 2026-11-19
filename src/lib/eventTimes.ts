// Event start and end: Start Date + Start Time, End Date + End Time. An event can run past midnight but lasts at most
// 48 hours. Shared by the event form (CRM events: times stored as clock times in UTC, like eventDate) and booth events
// (times stored as instants in the event's time zone; src/lib/genie/boothEvents.ts).

export const MAX_EVENT_HOURS = 48;
const DAY_MS = 86400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

export type EventSpanInput = { date: string; startTime?: string | null; endDate?: string | null; endTime?: string | null };

// CRM events: "2026-12-12" + "19:00" → 2026-12-12T19:00Z (shown back with eventTimeInput)
export const clockTime = (date: string, time: string) => new Date(`${date}T${time}:00Z`);

// The event's start and end instants, or why they don't work. With no End Date, an end time at or before the start
// time means the next day (e.g. 8 PM to 1 AM).
export function eventSpan(input: EventSpanInput, toInstant: (date: string, time: string) => Date = clockTime): { startTime: Date | null; endTime: Date | null } | { error: string } {
  const { date } = input;
  const startT = input.startTime || null, endT = input.endTime || null, endDate = input.endDate || null;
  if (!DATE.test(date)) return { error: 'Choose a start date' };
  if ((startT && !TIME.test(startT)) || (endT && !TIME.test(endT))) return { error: 'Times are HH:MM' };
  if (endDate && !DATE.test(endDate)) return { error: 'The end date is YYYY-MM-DD' };
  if (endDate && endDate < date) return { error: "The end date can't be before the start date" };
  if (endDate && endDate !== date && !endT) return { error: 'Add an end time for an event that ends on another day' };
  const startTime = startT ? toInstant(date, startT) : null;
  let endTime = endT ? toInstant(endDate ?? date, endT) : null;
  if (!endDate && startTime && endTime && endTime <= startTime) endTime = new Date(endTime.getTime() + DAY_MS);
  if (startTime && endTime) {
    if (endTime <= startTime) return { error: 'The event must end after it starts' };
    if (endTime.getTime() - startTime.getTime() > MAX_EVENT_HOURS * 3600_000) return { error: `An event can last at most ${MAX_EVENT_HOURS} hours` };
  } else if (endTime && endDate && endDate !== date) {
    // No start time: from the start of the start date
    if (endTime.getTime() - toInstant(date, '00:00').getTime() > MAX_EVENT_HOURS * 3600_000) return { error: `An event can last at most ${MAX_EVENT_HOURS} hours` };
  }
  return { startTime, endTime };
}

// The End Date to show in a form: the end's date when it's on a later day than the start, else ''
export function endDateInput(eventDate: Date | string, endTime: Date | string | null | undefined, dateOf: (d: Date) => string = d => d.toISOString().slice(0, 10)): string {
  if (!endTime) return '';
  const start = new Date(eventDate).toISOString().slice(0, 10);
  const end = dateOf(new Date(endTime));
  return end > start ? end : '';
}

// Wall-clock date and time of an instant in a time zone ("UTC" for CRM events' clock times)
function wallClock(at: Date, timeZone: string): { date: string; time: string } {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(at);
  const v = (t: string) => p.find(x => x.type === t)?.value ?? '00';
  return { date: `${v('year')}-${v('month')}-${v('day')}`, time: `${v('hour')}:${v('minute')}` };
}
const addDays = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * DAY_MS).toISOString().slice(0, 10);

// Today's date in a time zone
export const todayIn = (timeZone: string, now = new Date()) => wallClock(now, timeZone).date;

// Moves an event to another start date, keeping its times of day and how long it lasts (an end on the next day stays
// on the next day). toInstant rebuilds a time in the event's convention; timeZone is the zone its times are read in.
export function moveEventTo<T extends { eventDate: Date; setupTime: Date | null; startTime: Date | null; endTime: Date | null }>(
  e: T, newDate: string, timeZone: string, toInstant: (date: string, time: string) => Date,
): Pick<T, 'eventDate' | 'setupTime' | 'startTime' | 'endTime'> {
  const oldDate = e.eventDate.toISOString().slice(0, 10);
  const delta = Math.round((Date.parse(newDate + 'T00:00:00Z') - Date.parse(oldDate + 'T00:00:00Z')) / DAY_MS);
  const move = (at: Date | null) => {
    if (!at) return null;
    const w = wallClock(at, timeZone);
    return toInstant(addDays(w.date, delta), w.time);
  };
  return { eventDate: new Date(newDate + 'T00:00:00Z'), setupTime: move(e.setupTime), startTime: move(e.startTime), endTime: move(e.endTime) };
}
