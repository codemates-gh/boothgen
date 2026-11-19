export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';

// Recent guest texts and emails for the event, newest first, each with where the photo came from (the Genie booth, or
// PC booth software through the Sharing station, with the booth's name)
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: auth.tenantId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const where = { eventId: event.id, tenantId: auth.tenantId };
  const [shares, counts] = await Promise.all([
    prisma.genieShare.findMany({
      where, orderBy: { requestedAt: 'desc' }, take: 50,
      select: {
        id: true, channel: true, destination: true, firstName: true, status: true, error: true, attempts: true, requestedAt: true, sentAt: true, deliveredAt: true,
        session: { select: { assets: { where: { source: 'pcBooth' }, select: { boothName: true }, take: 1 } } },
      },
    }),
    prisma.genieShare.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);
  const pcBooth = await prisma.genieShare.count({ where: { ...where, session: { assets: { some: { source: 'pcBooth' } } } } });
  return NextResponse.json({
    shares: shares.map(({ session, ...s }) => {
      const pc = session.assets[0];
      return { ...s, source: pc ? 'pcBooth' : 'genie', boothName: pc?.boothName ?? null };
    }),
    counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])),
    bySource: { pcBooth, genie: counts.reduce((n, c) => n + c._count._all, 0) - pcBooth },
  });
}
