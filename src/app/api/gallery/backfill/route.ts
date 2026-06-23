export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';

// Creates missing Gallery records for any events that don't have one.
export async function POST() {
  const session = await requireTenantSession();
  const events = await prisma.event.findMany({
    where: { tenantId: session.tenantId, gallery: null },
    select: { id: true, title: true, tenantId: true },
  });
  if (events.length === 0) return NextResponse.json({ created: 0 });
  await prisma.gallery.createMany({
    data: events.map(e => ({ tenantId: e.tenantId, eventId: e.id, title: e.title + ' Gallery' })),
  });
  return NextResponse.json({ created: events.length });
}
