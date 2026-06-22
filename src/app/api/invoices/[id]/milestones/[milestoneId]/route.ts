export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; milestoneId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dueDate } = await req.json();
  if (!dueDate) return NextResponse.json({ error: 'dueDate required' }, { status: 400 });

  // Verify milestone belongs to this tenant's invoice
  const milestone = await prisma.paymentMilestone.findFirst({
    where: { id: params.milestoneId, invoiceId: params.id, tenantId: session.tenantId },
  });
  if (!milestone) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (milestone.status === 'PAID') return NextResponse.json({ error: 'Cannot edit a paid milestone' }, { status: 400 });

  const updated = await prisma.paymentMilestone.update({
    where: { id: params.milestoneId },
    data: { dueDate: new Date(dueDate) },
  });

  return NextResponse.json(updated);
}
