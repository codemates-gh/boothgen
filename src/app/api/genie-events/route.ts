export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { effectiveLockedAt, eventClosesAt, eventLocksAt } from '@/lib/genie/bundle';
import { getDefaults } from '@/lib/genie/defaults';
import { eventsBilling } from '@/lib/genie/payments';
import { BoothEventInput, boothEventFields, boothEventsClient, isBoothClient, setUpGenie } from '@/lib/genie/boothEvents';

// Events for the Genie → Events overview, by tab (G, 2026-11-20): ?tab=upcoming (before the start), ?tab=current (In
// Progress: from the start for 48 h) or ?tab=past (48 h after the start). A start without a time is the start of the
// event day in its time zone. ?past=1 is the older spelling of tab=past.
export async function GET(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const q = req.nextUrl.searchParams;
  const tab = q.get('past') === '1' ? 'past' : q.get('tab') === 'past' ? 'past' : q.get('tab') === 'current' ? 'current' : 'upcoming';
  const past = tab === 'past';
  const now = new Date();
  // Event dates are stored as UTC midnight; a day's margin either side covers every time zone, plus the 48 h window
  const day = 86400_000;
  const dateRange = tab === 'past' ? { lt: new Date(now.getTime() + day) }
    : tab === 'current' ? { gte: new Date(now.getTime() - 4 * day), lt: new Date(now.getTime() + 2 * day) }
    : { gte: new Date(now.getTime() - 2 * day) };
  const found = await prisma.event.findMany({
    where: {
      tenantId: auth.tenantId,
      status: { notIn: ['CANCELLED', 'LOST'] },
      eventDate: dateRange,
    },
    orderBy: { eventDate: past ? 'desc' : 'asc' },
    take: 150,
    select: {
      id: true, title: true, eventDate: true, startTime: true, endTime: true, status: true, venueName: true,
      client: { select: { firstName: true, lastName: true, email: true } },
      genieSettings: true,
      _count: { select: { genieTemplates: true, genieSessions: { where: { deletedAt: null } } } },
    },
  });
  const defaultTz = (await getDefaults(auth.tenantId)).values.timeZone;
  const tabOf = (e: typeof found[number]) => {
    const tz = e.genieSettings?.timeZone ?? defaultTz;
    return eventClosesAt(e, tz) <= now ? 'past' : eventLocksAt(e, tz) <= now ? 'current' : 'upcoming';
  };
  const events = found.filter(e => tabOf(e) === tab).slice(0, 100);
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
        // Pay per event, or an add-on (e.g. Glamour Style) not paid yet: unpaid events run with a watermark
        paysPerEvent: billing.get(e.id)!.paysPerEvent || billing.get(e.id)!.addOns.length > 0,
        paid: !billing.get(e.id)!.watermark,
        genie: s ? {
          enabled: s.enabled,
          templates: e._count.genieTemplates,
          ipads: slotsBy.get(e.id) ?? 0,
          maxDevices: s.maxDevices,
          sessions: e._count.genieSessions,
          lockedAt: effectiveLockedAt(e, s),
          ended: past,
          locksAt: eventLocksAt(e, s.timeZone),
          closesAt: eventClosesAt(e, s.timeZone),
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
  const fields = boothEventFields(parsed.data);
  if ('error' in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  const client = await boothEventsClient(auth.tenantId);
  const event = await prisma.event.create({
    data: { tenantId: auth.tenantId, clientId: client.id, status: 'BOOKED', ...fields },
  });
  await setUpGenie(auth.tenantId, event.id, parsed.data.timeZone);
  return NextResponse.json({ id: event.id }, { status: 201 });
}
