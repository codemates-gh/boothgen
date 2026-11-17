export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { effectiveLockedAt, eventEndsAt, eventLocksAt } from '@/lib/genie/bundle';
import { getDefaults } from '@/lib/genie/defaults';
import { eventsBilling } from '@/lib/genie/payments';
import { BoothEventInput, boothEventFields, boothEventsClient, isBoothClient, setUpGenie } from '@/lib/genie/boothEvents';

// Events for the Genie → Events overview: upcoming (not over yet) or past ones with ?past=1. An event is over at its
// end time, else at the end of its day in its time zone.
export async function GET(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const past = req.nextUrl.searchParams.get('past') === '1';
  const now = new Date();
  // Event dates are stored as UTC midnight; two days' margin covers every time zone and late end times
  const edge = new Date(now.getTime() - 2 * 86400_000);
  const found = await prisma.event.findMany({
    where: {
      tenantId: auth.tenantId,
      status: { notIn: ['CANCELLED', 'LOST'] },
      ...(past ? { eventDate: { lt: new Date(now.getTime() + 86400_000) } } : { eventDate: { gte: edge } }),
    },
    orderBy: { eventDate: past ? 'desc' : 'asc' },
    take: 150,
    select: {
      id: true, title: true, eventDate: true, startTime: true, endTime: true, status: true, venueName: true,
      client: { select: { firstName: true, lastName: true, email: true } },
      genieSettings: true,
      _count: { select: { genieTemplates: true, genieSessions: true } },
    },
  });
  const defaultTz = (await getDefaults(auth.tenantId)).values.timeZone;
  const isOver = (e: typeof found[number]) => eventEndsAt(e, e.genieSettings?.timeZone ?? defaultTz) <= now;
  const events = found.filter(e => isOver(e) === past).slice(0, 100);
  const ids = events.map(e => e.id);
  const [slots, shares] = await Promise.all([
    prisma.genieEventDevice.groupBy({ by: ['eventId'], where: { eventId: { in: ids }, releasedAt: null }, _count: { _all: true } }),
    prisma.genieShare.groupBy({ by: ['eventId', 'status'], where: { eventId: { in: ids } }, _count: { _all: true } }),
  ]);
  const slotsBy = new Map(slots.map(s => [s.eventId, s._count._all]));
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: auth.tenantId }, select: { id: true, product: true } });
  const billing = await eventsBilling(tenant, ids);
  return NextResponse.json({
    events: events.map(e => {
      const s = e.genieSettings;
      const sh = shares.filter(x => x.eventId === e.id);
      return {
        id: e.id, title: e.title, eventDate: e.eventDate, status: e.status, venueName: e.venueName,
        clientName: isBoothClient(e.client) ? null : `${e.client.firstName} ${e.client.lastName}`.trim(),
        boothEvent: isBoothClient(e.client),
        // Pay per event (Genie only): unpaid events run with a watermark
        paysPerEvent: billing.get(e.id)!.paysPerEvent,
        paid: billing.get(e.id)!.paid,
        genie: s ? {
          enabled: s.enabled,
          templates: e._count.genieTemplates,
          ipads: slotsBy.get(e.id) ?? 0,
          maxDevices: s.maxDevices,
          sessions: e._count.genieSessions,
          lockedAt: effectiveLockedAt(e, s),
          ended: past,
          locksAt: eventLocksAt(e, s.timeZone),
          timeZone: s.timeZone,
          followsDefaults: !s.customCapture || !s.customSharing || !s.customPrinting || !s.customTimeZone || !s.customAttract,
          shares: { total: sh.reduce((n, x) => n + x._count._all, 0), failed: sh.find(x => x.status === 'failed')?._count._all ?? 0 },
        } : null,
      };
    }),
  });
}

// New booth event (Genie → Events): no CRM client, Genie set up from the account's defaults
export async function POST(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = BoothEventInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: i?.message ?? 'Invalid request', path: i?.path.join('.') }, { status: 400 });
  }
  const client = await boothEventsClient(auth.tenantId);
  const event = await prisma.event.create({
    data: { tenantId: auth.tenantId, clientId: client.id, status: 'BOOKED', ...boothEventFields(parsed.data) },
  });
  await setUpGenie(auth.tenantId, event.id, parsed.data.timeZone);
  return NextResponse.json({ id: event.id }, { status: 201 });
}
