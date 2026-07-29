export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const expenses = await prisma.eventExpense.findMany({
    where: { eventId: params.id, tenantId: session.tenantId },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(expenses);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { description, amountCents, category } = await req.json();
  if (!description || amountCents == null) {
    return NextResponse.json({ error: 'description and amountCents required' }, { status: 400 });
  }

  const expense = await prisma.eventExpense.create({
    data: {
      tenantId: session.tenantId,
      eventId: params.id,
      description,
      amountCents: Math.round(amountCents),
      category: category ?? 'other',
    },
  });
  return NextResponse.json(expense, { status: 201 });
}
