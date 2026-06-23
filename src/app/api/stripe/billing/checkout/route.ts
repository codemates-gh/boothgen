export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { stripeSubscription: true },
  });
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  // Already subscribed — redirect to billing portal instead
  if (tenant.stripeSubscription?.stripeCustomerId && tenant.stripeSubscription.status === 'ACTIVE') {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeSubscription.stripeCustomerId,
      return_url: APP_URL + '/settings/billing',
    });
    return NextResponse.json({ url: portalSession.url });
  }

  const setting = await prisma.systemSetting.findUnique({ where: { key: 'stripe_price_monthly_id' } });
  const priceId = setting?.value || process.env.STRIPE_PRICE_MONTHLY_ID;
  if (!priceId) return NextResponse.json({ error: 'Billing not configured. Contact support.' }, { status: 500 });

  // Find or create Stripe customer
  let customerId = tenant.stripeSubscription?.stripeCustomerId;
  if (!customerId) {
    const user = await prisma.user.findFirst({
      where: { memberships: { some: { tenantId: session.tenantId, role: 'HOST_ADMIN' } } },
    });
    const customer = await stripe.customers.create({
      email: user?.email ?? undefined,
      name: tenant.name,
      metadata: { tenantId: session.tenantId },
    });
    customerId = customer.id;
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: session.tenantId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: APP_URL + '/settings/billing?upgraded=1',
    cancel_url: APP_URL + '/settings/billing',
    subscription_data: {
      metadata: { tenantId: session.tenantId },
    },
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
