export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const tenantId = (session as any)?.tenantId;
  const role     = (session as any)?.tenantRole;
  if (!tenantId || role !== 'HOST_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId } });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  if (!['ARCHIVED', 'LOST'].includes(event.status)) {
    return NextResponse.json({ error: 'Only ARCHIVED or LOST events can be reinstated' }, { status: 400 });
  }

  // ARCHIVED events go back to BOOKED; LOST events (were never booked) go back to LEAD
  const newStatus = event.status === 'ARCHIVED' ? 'BOOKED' : 'LEAD';

  await prisma.event.update({
    where: { id: event.id },
    data: { status: newStatus },
  });

  return NextResponse.json({ success: true, status: newStatus });
}
