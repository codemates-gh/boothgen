export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { authenticateDevice } from '@/lib/genie/auth';
import { designApprovalPending } from '@/lib/genie/bundle';

export async function GET(req: NextRequest) {
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;

  const events = await prisma.event.findMany({
    where: { tenantId: auth.tenant.id, status: { in: ['BOOKED', 'IN_PROGRESS'] } },
    orderBy: { eventDate: 'asc' },
    select: {
      id: true, title: true, eventDate: true, status: true,
      genieSettings: { select: { bundleVersion: true } },
      _count: { select: { genieTemplates: true } },
    },
  });
  const pending = await designApprovalPending(events.map(e => e.id));

  return NextResponse.json({
    events: events.map(e => ({
      id: e.id,
      title: e.title,
      eventDate: e.eventDate.toISOString(),
      status: e.status,
      bundleVersion: e.genieSettings?.bundleVersion ?? 0,
      ready: !!e.genieSettings && e._count.genieTemplates > 0,
      designApprovalPending: pending.has(e.id),
    })),
  });
}
