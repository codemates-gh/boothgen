export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(_: NextRequest, { params }: { params: { id: string; milestoneId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Plan gate: only MONTHLY or ANNUAL subscribers can mark payments as externally paid
  const subscription = await prisma.stripeSubscription.findUnique({ where: { tenantId: session.tenantId } });
  const isPro = subscription?.plan === 'MONTHLY' || subscription?.plan === 'ANNUAL';
  if (!isPro) {
    return NextResponse.json({ error: 'Upgrade required', upgradeRequired: true }, { status: 403 });
  }

  const milestone = await prisma.paymentMilestone.findFirst({
    where: { id: params.milestoneId, tenantId: session.tenantId },
    include: { invoice: true },
  });
  if (!milestone) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (milestone.invoiceId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (milestone.status === 'PAID') return NextResponse.json({ error: 'Already paid' }, { status: 400 });

  // Mark milestone paid
  await prisma.paymentMilestone.update({
    where: { id: params.milestoneId },
    data: { status: 'PAID', paidAt: new Date() },
  });

  // Recompute invoice totals from all milestones
  const allMilestones = await prisma.paymentMilestone.findMany({ where: { invoiceId: params.id } });
  const amountPaidCents = allMilestones
    .filter(m => m.status === 'PAID' || (m.id === params.milestoneId))
    .reduce((sum, m) => sum + m.amountCents, 0);
  const balanceDueCents = milestone.invoice.totalCents - amountPaidCents;
  const allPaid = amountPaidCents >= milestone.invoice.totalCents;
  const invoiceStatus = allPaid ? 'PAID' : amountPaidCents > 0 ? 'PARTIALLY_PAID' : 'SENT';

  await prisma.invoice.update({
    where: { id: params.id },
    data: { amountPaidCents, balanceDueCents: Math.max(0, balanceDueCents), status: invoiceStatus },
  });

  // Advance event to BOOKED if it's still a lead/quote
  if (milestone.invoice.eventId) {
    await prisma.event.updateMany({
      where: { id: milestone.invoice.eventId, status: { in: ['LEAD', 'QUOTED'] } },
      data: { status: 'BOOKED' },
    });
  }

  return NextResponse.json({ success: true, invoiceStatus });
}
