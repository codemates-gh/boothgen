
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma/client';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'No sig' }, { status: 400 });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!); }
  catch { return NextResponse.json({ error: 'Invalid sig' }, { status: 400 }); }

  const sub = (event.data.object as any);
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    await prisma.stripeSubscription.upsert({
      where: { stripeCustomerId: sub.customer },
      update: { stripeSubscriptionId: sub.id, status: sub.status.toUpperCase(), currentPeriodStart: new Date(sub.current_period_start * 1000), currentPeriodEnd: new Date(sub.current_period_end * 1000), cancelAtPeriodEnd: sub.cancel_at_period_end },
      create: { tenantId: 'unknown', stripeCustomerId: sub.customer, stripeSubscriptionId: sub.id, plan: 'MONTHLY', status: sub.status.toUpperCase() },
    });
  }
  if (event.type === 'invoice.payment_failed') {
    const invoice = sub as Stripe.Invoice;
    const stripeRecord = await prisma.stripeSubscription.findFirst({ where: { stripeCustomerId: invoice.customer as string } });
    if (stripeRecord) await prisma.tenant.update({ where: { id: stripeRecord.tenantId }, data: { status: 'SUSPENDED' } });
  }
  return NextResponse.json({ received: true });
}
