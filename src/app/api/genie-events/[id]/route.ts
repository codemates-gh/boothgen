export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { BoothEventInput, boothEventFields, isBoothClient } from '@/lib/genie/boothEvents';
import { effectiveLockedAt } from '@/lib/genie/bundle';

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
  const timeZone = event.genieSettings?.timeZone ?? 'UTC';
  const fields = boothEventFields({ ...parsed.data, timeZone });
  // Once the event has started on the iPad, the name and venue can change but not when it happens
  if (event.genieSettings && effectiveLockedAt(event, event.genieSettings)) {
    const same = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);
    if (!same(fields.eventDate, event.eventDate) || !same(fields.startTime, event.startTime) || !same(fields.endTime, event.endTime)) {
      return NextResponse.json({ error: 'The event has started, so its date and times can no longer change', code: 'locked' }, { status: 409 });
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
  if (await prisma.genieSession.count({ where: { eventId: event.id } })) {
    return NextResponse.json({ error: 'This event has guest photos, so it can\'t be deleted', code: 'has_photos' }, { status: 409 });
  }
  await prisma.event.delete({ where: { id: event.id } });
  return NextResponse.json({ ok: true });
}
