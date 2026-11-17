export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string; itemId: string }> }
) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const item = await prisma.eventChecklistItem.findFirst({
    where: { id: params.itemId, eventId: params.id, tenantId: session.tenantId },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.eventChecklistItem.update({
    where: { id: params.itemId },
    data: {
      ...(body.isCompleted !== undefined && { isCompleted: body.isCompleted }),
      ...(body.label !== undefined && { label: body.label.trim() }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string; itemId: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.eventChecklistItem.deleteMany({
    where: { id: params.itemId, eventId: params.id, tenantId: session.tenantId },
  });
  return NextResponse.json({ success: true });
}
