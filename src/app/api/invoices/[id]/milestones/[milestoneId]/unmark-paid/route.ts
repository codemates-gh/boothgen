export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(_: NextRequest, { params }: { params: { id: string; milestoneId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const subscription = await prisma.stripeSubscription.findUnique({ where: { tenantId: session.tenantId } });
  const isPro = subscription?.plan === 'MONTHLY' || subscription?.plan === 'ANNUAL' || subscription?.plan === 'LIFETIME';
  if (!isPro) return NextResponse.json({ error: 'Upgrade required', upgradeRequired: true }, { status: 403 });

  const milestone = await prisma.paymentMilestone.findFirst({
    where: { id: params.milestoneId, tenantId: session.tenantId },
    include: { invoice: true },
  });
  if (!milestone) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (milestone.invoiceId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (milestone.status !== 'PAID') return NextResponse.json({ error: 'Milestone is not marked as paid' }, { status: 400 });

  // Stripe-paid milestones cannot be undone here — they require a refund in Stripe
  if (milestone.stripePaymentIntentId) {
    return NextResponse.json({ error: 'This payment was collected via Stripe and cannot be undone here. Issue a refund from your Stripe dashboard.' }, { status: 400 });
  }

  await prisma.paymentMilestone.update({
    where: { id: params.milestoneId },
    data: { status: 'PENDING', paidAt: null, paymentMethod: null },
  });

  // Recompute invoice totals
  const allMilestones = await prisma.paymentMilestone.findMany({ where: { invoiceId: params.id } });
  const amountPaidCents = allMilestones
    .filter(m => m.id !== params.milestoneId && m.status === 'PAID')
    .reduce((sum, m) => sum + m.amountCents, 0);
  const balanceDueCents = milestone.invoice.totalCents - amountPaidCents;
  const invoiceStatus = amountPaidCents > 0 ? 'PARTIALLY_PAID' : 'SENT';

  await prisma.invoice.update({
    where: { id: params.id },
    data: { amountPaidCents, balanceDueCents: Math.max(0, balanceDueCents), status: invoiceStatus },
  });

  return NextResponse.json({ success: true, invoiceStatus });
}
