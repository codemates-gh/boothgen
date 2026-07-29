export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; expenseId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const expense = await prisma.eventExpense.findFirst({
    where: { id: params.expenseId, eventId: params.id, tenantId: session.tenantId },
  });
  if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.eventExpense.delete({ where: { id: params.expenseId } });
  return NextResponse.json({ ok: true });
}
