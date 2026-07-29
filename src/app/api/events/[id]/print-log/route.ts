export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = session.tenantRole === 'HOST_ADMIN';
  const event = await prisma.event.findFirst({
    where: {
      id: params.id,
      tenantId: session.tenantId,
      ...(isAdmin ? {} : { assignedToUserId: session.userId }),
    },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const log = await prisma.eventPrintLog.findUnique({
    where: { eventId: params.id },
    include: { consumableProfile: true },
  });
  return NextResponse.json(log ?? null);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const isAdmin = session.tenantRole === 'HOST_ADMIN';
  const event = await prisma.event.findFirst({
    where: {
      id: params.id,
      tenantId: session.tenantId,
      ...(isAdmin ? {} : { assignedToUserId: session.userId }),
    },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { printCount, consumableProfileId, notes } = await req.json();

  const log = await prisma.eventPrintLog.upsert({
    where: { eventId: params.id },
    create: {
      tenantId: session.tenantId,
      eventId: params.id,
      printCount: Math.max(0, printCount ?? 0),
      consumableProfileId: consumableProfileId ?? null,
      notes: notes ?? null,
    },
    update: {
      printCount: Math.max(0, printCount ?? 0),
      consumableProfileId: consumableProfileId ?? null,
      notes: notes ?? null,
    },
    include: { consumableProfile: true },
  });
  return NextResponse.json(log);
}
