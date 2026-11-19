import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { briefLibraryTemplate, copyToEvent, findLibraryTemplate } from '@/lib/genie/library';
import { applyApprovedDesignToGenie } from '@/lib/genie/autoApplyDesign';
import { getDefaults, newEventSettingsData } from '@/lib/genie/defaults';
import { isValidTimeZone, tzOffsetMs } from '@/lib/genie/bundle';

// Booth events: events made from Genie → Events without the CRM (Genie-only accounts, or anyone who just needs a booth).
// Every event needs a client, so they all go on one "Booth events" client per account. Plan: docs/genie/genie-only-plan.md

import { BOOTH_CLIENT_EMAIL } from '@/lib/genie/boothClient';
import { eventSpan } from '@/lib/eventTimes';
export { BOOTH_CLIENT_EMAIL, isBoothClient } from '@/lib/genie/boothClient';

export async function boothEventsClient(tenantId: string) {
  return prisma.client.upsert({
    where: { tenantId_email: { tenantId, email: BOOTH_CLIENT_EMAIL } },
    update: {},
    create: { tenantId, email: BOOTH_CLIENT_EMAIL, firstName: 'Booth', lastName: 'events', notes: 'Holds events created from Genie → Events.' },
  });
}

// A wall-clock date and time in a time zone → the instant. date "2026-12-12", time "18:30".
export function zonedTime(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes so the offset is the one in force at that local time (daylight saving changes)
  const first = guess - tzOffsetMs(timeZone, new Date(guess));
  return new Date(guess - tzOffsetMs(timeZone, new Date(first)));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const BoothEventInput = z.object({
  title: z.string().trim().min(1, 'Name the event').max(200),
  date: z.string().regex(DATE, 'Pick a date'),
  startTime: z.string().regex(TIME, 'Start time is HH:MM').nullable().optional(),
  // Only when the event ends on a later day than it starts
  endDate: z.string().regex(DATE, 'Pick an end date').nullable().optional(),
  endTime: z.string().regex(TIME, 'End time is HH:MM').nullable().optional(),
  venueName: z.string().trim().max(200).nullable().optional(),
  timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
}).strict();
export type BoothEventInput = z.infer<typeof BoothEventInput>;

// Event fields from the form: Start Date/Time to End Date/Time in the event's time zone, at most 48 hours. Without an
// End Date, an end time earlier than the start runs past midnight (next day).
export function boothEventFields(input: BoothEventInput) {
  const span = eventSpan({ date: input.date, startTime: input.startTime, endDate: input.endDate, endTime: input.endTime }, (d, t) => zonedTime(d, t, input.timeZone));
  if ('error' in span) return span;
  return {
    title: input.title,
    eventDate: new Date(input.date + 'T00:00:00Z'), // stored at UTC midnight, like CRM events
    startTime: span.startTime, endTime: span.endTime,
    venueName: input.venueName?.trim() || null,
  };
}

// Turns Genie on for an event: the account's defaults, its default templates (after the layout the client picked in a
// design brief) and an approved design. Returns null when the event already has Genie settings.
export async function setUpGenie(tenantId: string, eventId: string, timeZone?: string) {
  const defaults = await getDefaults(tenantId);
  const s = await prisma.eventGenieSettings.create({ data: { tenantId, eventId, ...newEventSettingsData(defaults.values, timeZone) } });
  if ((await prisma.eventGenieTemplate.count({ where: { eventId } })) === 0) {
    const picked = await briefLibraryTemplate(tenantId, eventId);
    const added = new Set<string>();
    for (const lib of [picked, ...await Promise.all(defaults.templateIds.map(id => findLibraryTemplate(tenantId, id)))]) {
      if (!lib || added.has(lib.id)) continue;
      const r = await copyToEvent(tenantId, eventId, lib, !!lib.alternateLayout);
      if (!('error' in r)) added.add(lib.id);
    }
  }
  await applyApprovedDesignToGenie(tenantId, eventId).catch(e => console.error('[genie-setup] auto-apply failed:', e));
  return s;
}
