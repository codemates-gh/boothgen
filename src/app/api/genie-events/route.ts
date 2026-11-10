export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { effectiveLockedAt, eventLocksAt } from '@/lib/genie/bundle';

// Events for the Genie → Events overview: upcoming (and the last 7 days) or all past ones with ?past=1
export async function GET(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const past = req.nextUrl.searchParams.get('past') === '1';
  const since = new Date(Date.now() - 7 * 86400_000);
  const events = await prisma.event.findMany({
    where: {
      tenantId: auth.tenantId,
      status: { notIn: ['CANCELLED', 'LOST'] },
      ...(past ? { eventDate: { lt: since } } : { eventDate: { gte: since } }),
    },
    orderBy: { eventDate: past ? 'desc' : 'asc' },
    take: 100,
    select: {
      id: true, title: true, eventDate: true, startTime: true, status: true, venueName: true,
      client: { select: { firstName: true, lastName: true } },
      genieSettings: true,
      _count: { select: { genieTemplates: true, genieSessions: true } },
    },
  });
  const ids = events.map(e => e.id);
  const [slots, shares] = await Promise.all([
    prisma.genieEventDevice.groupBy({ by: ['eventId'], where: { eventId: { in: ids }, releasedAt: null }, _count: { _all: true } }),
    prisma.genieShare.groupBy({ by: ['eventId', 'status'], where: { eventId: { in: ids } }, _count: { _all: true } }),
  ]);
  const slotsBy = new Map(slots.map(s => [s.eventId, s._count._all]));
  return NextResponse.json({
    events: events.map(e => {
      const s = e.genieSettings;
      const sh = shares.filter(x => x.eventId === e.id);
      return {
        id: e.id, title: e.title, eventDate: e.eventDate, status: e.status, venueName: e.venueName,
        clientName: `${e.client.firstName} ${e.client.lastName}`.trim(),
        genie: s ? {
          enabled: s.enabled,
          templates: e._count.genieTemplates,
          ipads: slotsBy.get(e.id) ?? 0,
          maxDevices: s.maxDevices,
          sessions: e._count.genieSessions,
          lockedAt: effectiveLockedAt(e, s),
          locksAt: eventLocksAt(e, s.timeZone),
          timeZone: s.timeZone,
          followsDefaults: !s.customCapture || !s.customSharing || !s.customPrinting || !s.customTimeZone,
          shares: { total: sh.reduce((n, x) => n + x._count._all, 0), failed: sh.find(x => x.status === 'failed')?._count._all ?? 0 },
        } : null,
      };
    }),
  });
}
