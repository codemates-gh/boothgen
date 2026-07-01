export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const event = await prisma.event.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!['LEAD', 'QUOTED'].includes(event.status)) {
    return NextResponse.json({ error: 'Only LEAD or QUOTED events can be marked lost' }, { status: 400 });
  }

  const updated = await prisma.event.update({
    where: { id: params.id },
    data: { status: 'LOST' },
  });
  return NextResponse.json(updated);
}
