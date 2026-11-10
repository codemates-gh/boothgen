export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';

// Recent guest texts and emails for the event, newest first
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: auth.tenantId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const where = { eventId: event.id, tenantId: auth.tenantId };
  const [shares, counts] = await Promise.all([
    prisma.genieShare.findMany({
      where, orderBy: { requestedAt: 'desc' }, take: 50,
      select: { id: true, channel: true, destination: true, firstName: true, status: true, error: true, attempts: true, requestedAt: true, sentAt: true, deliveredAt: true },
    }),
    prisma.genieShare.groupBy({ by: ['status'], where, _count: { _all: true } }),
  ]);
  return NextResponse.json({
    shares,
    counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])),
  });
}
