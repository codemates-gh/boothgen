export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const event = await prisma.event.findFirst({
    where: { id: params.id, tenantId: session.tenantId, status: 'COMPLETED' },
    include: { gallery: { select: { _count: { select: { assets: true } } } } },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const photoCount = event.gallery?._count.assets ?? 0;
  if (photoCount === 0) {
    return NextResponse.json({ error: 'no_photos' }, { status: 409 });
  }

  const updated = await prisma.event.update({ where: { id: params.id }, data: { status: 'ARCHIVED' } });
  return NextResponse.json(updated);
}
