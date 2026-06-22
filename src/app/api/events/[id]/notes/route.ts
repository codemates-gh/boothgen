export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const notes = await prisma.eventNote.findMany({
    where: { eventId: params.id, tenantId: session.tenantId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || !session?.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { body } = await req.json();
  if (!body?.trim()) return NextResponse.json({ error: 'Note body is required' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { name: true } });

  const note = await prisma.eventNote.create({
    data: {
      eventId: params.id,
      tenantId: session.tenantId,
      userId: session.userId,
      userName: user?.name ?? 'Unknown',
      body: body.trim(),
    },
  });
  return NextResponse.json(note, { status: 201 });
}
