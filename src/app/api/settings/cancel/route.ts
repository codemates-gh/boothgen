export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tid = session.tenantId;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tid },
    include: { stripeSubscription: { select: { stripeSubscriptionId: true, stripeCustomerId: true } } },
  });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (tenant.status === 'CANCELLED') return NextResponse.json({ error: 'Already cancelled' }, { status: 400 });

  // Cancel Stripe subscription at period end (not immediately — let them keep access until paid period ends)
  const subId = tenant.stripeSubscription?.stripeSubscriptionId;
  if (subId) {
    try {
      await stripe.subscriptions.update(subId, { cancel_at_period_end: true });
    } catch (err: any) {
      console.error('[cancel] Stripe subscription update failed:', err.message);
    }
  }

  const now = new Date();
  await prisma.tenant.update({
    where: { id: tid },
    data: { status: 'CANCELLED', cancelledAt: now },
  });

  return NextResponse.json({ success: true, cancelledAt: now.toISOString() });
}
