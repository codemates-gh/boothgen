export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { BoothEventInput, boothEventFields, isBoothClient } from '@/lib/genie/boothEvents';
import { effectiveLockedAt, eventTimesLockAt } from '@/lib/genie/bundle';
import { endedResponse, hasEnded } from '@/lib/genie/eventAdmin';

// A booth event's details (name, date, times, venue). CRM events are edited from the CRM event page.
async function findBoothEvent(tenantId: string, id: string) {
  const event = await prisma.event.findFirst({ where: { id, tenantId }, include: { client: { select: { email: true } }, genieSettings: true } });
  return event && isBoothClient(event.client) ? event : null;
}

const Patch = BoothEventInput.omit({ timeZone: true });

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: i?.message ?? 'Invalid request', path: i?.path.join('.') }, { status: 400 });
  }
  const event = await findBoothEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // A Past event can only be duplicated
  if (hasEnded(event)) return endedResponse();
  const timeZone = event.genieSettings?.timeZone ?? 'UTC';
  const fields = boothEventFields({ ...parsed.data, timeZone });
  if ('error' in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  // In Progress (from 12:00 AM on the event day, photos or not): the date can't change; the times can until the end of
  // the event day, then they're fixed too. The name and venue can always change (G, 2026-11-20)
  if (event.genieSettings && effectiveLockedAt(event, event.genieSettings)) {
    const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
    if (!same(fields.eventDate, event.eventDate)) {
      return NextResponse.json({ error: 'The event day has started, so its date can no longer change. Its times can change until the end of the day.', code: 'locked' }, { status: 409 });
    }
    if (eventTimesLockAt(event, timeZone) <= new Date() && (!same(fields.startTime, event.startTime) || !same(fields.endTime, event.endTime))) {
      return NextResponse.json({ error: 'The event day is over, so its times can no longer change', code: 'locked' }, { status: 409 });
    }
  }
  await prisma.event.update({ where: { id: event.id }, data: fields });
  return NextResponse.json({ ok: true });
}

// Only an unpaid event with no photos yet: deleting removes everything that belongs to it
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const event = await findBoothEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (await prisma.genieEventPayment.count({ where: { eventId: event.id, status: 'paid' } })) {
    return NextResponse.json({ error: 'This event is paid, so it can\'t be deleted', code: 'paid' }, { status: 409 });
  }
  if (await prisma.genieSession.count({ where: { eventId: event.id, deletedAt: null } })) {
    return NextResponse.json({ error: 'This event has guest photos, so it can\'t be deleted', code: 'has_photos' }, { status: 409 });
  }
  await prisma.event.delete({ where: { id: event.id } });
  return NextResponse.json({ ok: true });
}
