import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const APP = process.env.NEXT_PUBLIC_APP_URL!;
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.redirect(new URL('/sign-in', req.url));
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { stripeConnect: true, branding: true } });
  if (!tenant) return NextResponse.redirect(new URL('/dashboard', req.url));
  let accountId: string;
  if (tenant.stripeConnect?.stripeAccountId && tenant.stripeConnect.onboardingStatus !== 'DEAUTHORIZED') {
    accountId = tenant.stripeConnect.stripeAccountId;
  } else {
    const acct = await stripe.accounts.create({ type: 'express', capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, business_profile: { name: tenant.branding?.companyName ?? tenant.name, mcc: '7929' }, metadata: { tenant_id: tenant.id } });
    accountId = acct.id;
    await prisma.stripeConnectAccount.upsert({ where: { tenantId: tenant.id }, create: { tenantId: tenant.id, stripeAccountId: acct.id, onboardingStatus: 'ONBOARDING_INITIATED', livemode: acct.livemode }, update: { stripeAccountId: acct.id, onboardingStatus: 'ONBOARDING_INITIATED' } });
  }
  const link = await stripe.accountLinks.create({ account: accountId, refresh_url: APP + '/api/stripe/connect/authorize', return_url: APP + '/api/stripe/connect/callback?account_id=' + accountId + '&tenant_id=' + tenant.id, type: 'account_onboarding' });
  return NextResponse.redirect(link.url);
}
