export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { copyGenieSetup } from '@/lib/genie/duplicate';
import { clockTime, moveEventTo, todayIn } from '@/lib/eventTimes';
import { isBoothClient, zonedTime } from '@/lib/genie/boothEvents';
import { getDefaults } from '@/lib/genie/defaults';
import { eventLocksAt } from '@/lib/genie/bundle';

// Copy an event as a new Lead for the same client: venue, package, guest count, estimated value, and its Genie setup
// (settings and templates; see copyGenieSetup). The copy starts today (tomorrow when today's start time has passed; in the event's time zone) with the same times
// and length, so even an expired event can be run again. Quotes, invoices, contracts, notes, checklist, photos, Genie
// iPads and payments aren't copied, and no automations run (the client isn't emailed); the host adjusts the date on
// the edit page.
export async function POST(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const e = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: { select: { email: true } }, genieSettings: { select: { timeZone: true } } } });
  if (!e) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Today in the event's time zone (else the account's Genie time zone). Booth events keep their times in that zone;
  // CRM events keep clock times (UTC), so they move as they are.
  const timeZone = e.genieSettings?.timeZone ?? (await getDefaults(e.tenantId)).values.timeZone;
  const booth = isBoothClient(e.client);
  const moveTo = (date: string) => moveEventTo(e, date, booth ? timeZone : 'UTC', booth ? (d, t) => zonedTime(d, t, timeZone) : clockTime);
  const today = todayIn(timeZone);
  let when = moveTo(today);
  // A started event's date and times can't change (G, 2026-11-20): when today's start has already passed, the copy
  // starts tomorrow instead, so it can still be moved
  if (eventLocksAt(when, timeZone) <= new Date()) when = moveTo(new Date(Date.parse(today + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10));

  const title = `${e.title} (copy)`;
  const copy = await prisma.$transaction(async tx => {
    const created = await tx.event.create({
      data: {
        // Booth events have no sales pipeline: their copies are booked, so iPads see them
        tenantId: e.tenantId, clientId: e.clientId, title, status: booth ? 'BOOKED' : 'LEAD',
        ...when,
        venueName: e.venueName, venueAddress: e.venueAddress, venueCity: e.venueCity, venueState: e.venueState,
        venuePostalCode: e.venuePostalCode, packageName: e.packageName, packageNotes: e.packageNotes,
        guestCount: e.guestCount, estimatedValueCents: e.estimatedValueCents, internalNotes: e.internalNotes,
        gallery: { create: { tenantId: e.tenantId, title: title + ' Gallery' } },
      },
      select: { id: true },
    });
    const genie = await copyGenieSetup(tx, e.id, created.id, e.tenantId);
    return { ...created, genie };
  });
  return NextResponse.json(copy, { status: 201 });
}
