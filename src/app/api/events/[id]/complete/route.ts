export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const event = await prisma.event.findFirst({
    where: { id: params.id, tenantId: session.tenantId, status: { in: ['BOOKED', 'IN_PROGRESS'] } },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.event.update({ where: { id: params.id }, data: { status: 'COMPLETED' } });
  return NextResponse.json(updated);
}
