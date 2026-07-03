export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  return session?.globalRole === 'SUPER_ADMIN' ? session : null;
}

// DELETE — cancel the operator's Stripe subscription
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const immediate = body.immediate === true;

  const sub = await prisma.stripeSubscription.findUnique({ where: { tenantId: params.id } });
  if (!sub?.stripeSubscriptionId) {
    return NextResponse.json({ error: 'No active Stripe subscription found' }, { status: 400 });
  }

  if (immediate) {
    await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    await prisma.stripeSubscription.update({
      where: { tenantId: params.id },
      data: { status: 'CANCELLED', plan: 'FREE_TRIAL', cancelAtPeriodEnd: false, cancelledAt: new Date() },
    });
  } else {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    await prisma.stripeSubscription.update({
      where: { tenantId: params.id },
      data: { cancelAtPeriodEnd: true },
    });
  }

  return NextResponse.json({ ok: true });
}

// POST — refund the operator's most recent subscription charge
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const sub = await prisma.stripeSubscription.findUnique({ where: { tenantId: params.id } });
  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ error: 'No Stripe customer found' }, { status: 400 });
  }

  const invoices = await stripe.invoices.list({
    customer: sub.stripeCustomerId,
    status: 'paid',
    limit: 1,
  });
  const invoice = invoices.data[0];
  if (!invoice) return NextResponse.json({ error: 'No paid invoices found for this operator' }, { status: 400 });
  if (!invoice.payment_intent) return NextResponse.json({ error: 'Invoice has no associated payment' }, { status: 400 });

  const refund = await stripe.refunds.create({
    payment_intent: invoice.payment_intent as string,
  });

  return NextResponse.json({ ok: true, refundId: refund.id, amountCents: refund.amount });
}
