export const dynamic = 'force-dynamic';

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

  const obj = (event.data.object as any);

  if (event.type === 'checkout.session.completed') {
    const checkoutSession = obj as Stripe.Checkout.Session;
    if (checkoutSession.mode === 'subscription' && checkoutSession.subscription) {
      const tenantId = checkoutSession.client_reference_id ?? checkoutSession.metadata?.tenantId;
      if (tenantId) {
        const stripeSub = await stripe.subscriptions.retrieve(checkoutSession.subscription as string);
        const priceId = stripeSub.items.data[0]?.price?.id;
        const annualSetting = await prisma.systemSetting.findUnique({ where: { key: 'stripe_price_annual_id' } });
        const annualPriceId = annualSetting?.value || process.env.STRIPE_PRICE_ANNUAL_ID;
        const plan = priceId && priceId === annualPriceId ? 'ANNUAL' : 'MONTHLY';
        await prisma.stripeSubscription.upsert({
          where: { tenantId },
          update: {
            stripeCustomerId: checkoutSession.customer as string,
            stripeSubscriptionId: stripeSub.id,
            plan,
            status: stripeSub.status.toUpperCase() as any,
            stripePriceId: priceId,
            currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
          },
          create: {
            tenantId,
            stripeCustomerId: checkoutSession.customer as string,
            stripeSubscriptionId: stripeSub.id,
            plan,
            status: stripeSub.status.toUpperCase() as any,
            stripePriceId: priceId,
            currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
          },
        });
        await prisma.tenant.update({ where: { id: tenantId }, data: { status: 'ACTIVE' } });
      }
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const priceId = obj.items?.data?.[0]?.price?.id;
    const annualSetting2 = await prisma.systemSetting.findUnique({ where: { key: 'stripe_price_annual_id' } });
    const annualPriceId2 = annualSetting2?.value || process.env.STRIPE_PRICE_ANNUAL_ID;
    const plan = priceId && priceId === annualPriceId2 ? 'ANNUAL' : 'MONTHLY';
    await prisma.stripeSubscription.updateMany({
      where: { stripeCustomerId: obj.customer },
      data: {
        stripeSubscriptionId: obj.id,
        plan,
        status: obj.status.toUpperCase(),
        stripePriceId: priceId,
        currentPeriodStart: new Date(obj.current_period_start * 1000),
        currentPeriodEnd: new Date(obj.current_period_end * 1000),
        cancelAtPeriodEnd: obj.cancel_at_period_end,
      },
    });
  }

  if (event.type === 'customer.subscription.deleted') {
    await prisma.stripeSubscription.updateMany({
      where: { stripeCustomerId: obj.customer },
      data: { status: 'CANCELLED' },
    });
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = obj as Stripe.Invoice;
    const stripeRecord = await prisma.stripeSubscription.findFirst({ where: { stripeCustomerId: invoice.customer as string } });
    if (stripeRecord) await prisma.tenant.update({ where: { id: stripeRecord.tenantId }, data: { status: 'SUSPENDED' } });
  }

  return NextResponse.json({ received: true });
}
