export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { authenticateDevice } from '@/lib/genie/auth';
import { bundleValidUntil, designApprovalPending } from '@/lib/genie/bundle';
import { slotStatusForDevice } from '@/lib/genie/slots';

export async function GET(req: NextRequest) {
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;

  const all = await prisma.event.findMany({
    // Events with Genie turned off are hidden from iPads. COMPLETED stays listed until the event expires below (the
    // daily auto-complete may mark an evening event completed while it's still running)
    where: { tenantId: auth.tenant.id, status: { in: ['BOOKED', 'IN_PROGRESS', 'COMPLETED'] }, NOT: { genieSettings: { is: { enabled: false } } } },
    orderBy: { eventDate: 'asc' },
    select: {
      id: true, title: true, eventDate: true, endTime: true, status: true,
      genieSettings: { select: { bundleVersion: true, maxDevices: true, timeZone: true } },
      _count: { select: { genieTemplates: true } },
    },
  });
  // Expired events (48 hours after they ended) are no longer offered to iPads
  const now = Date.now();
  const events = all.filter(e => bundleValidUntil(e, e.genieSettings?.timeZone ?? 'UTC').getTime() > now);
  const pending = await designApprovalPending(events.map(e => e.id));
  const slots = await slotStatusForDevice(auth.device.id, events.map(e => ({ id: e.id, maxDevices: e.genieSettings?.maxDevices ?? 2 })));

  return NextResponse.json({
    events: events.map(e => ({
      id: e.id,
      title: e.title,
      eventDate: e.eventDate.toISOString(),
      // The wire allows BOOKED | IN_PROGRESS: an auto-completed event that hasn't expired is still running for the iPad
      status: e.status === 'COMPLETED' ? 'IN_PROGRESS' : e.status,
      bundleVersion: e.genieSettings?.bundleVersion ?? 0,
      ready: !!e.genieSettings && e._count.genieTemplates > 0,
      designApprovalPending: pending.has(e.id),
      ...slots.get(e.id)!,
    })),
  });
}
