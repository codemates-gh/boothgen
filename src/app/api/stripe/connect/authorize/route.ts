export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'placeholder', { apiVersion: '2024-04-10' });
const APP = process.env.NEXT_PUBLIC_APP_URL ?? '';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { stripeConnect: true } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let accountId = tenant.stripeConnect?.stripeAccountId;
  if (!accountId) {
    const acct = await stripe.accounts.create({ type: 'express' });
    accountId = acct.id;
    await prisma.stripeConnectAccount.upsert({ where: { tenantId: tenant.id }, update: { stripeAccountId: accountId }, create: { tenantId: tenant.id, stripeAccountId: accountId, onboardingStatus: 'ONBOARDING_INITIATED' } });
  }
  const link = await stripe.accountLinks.create({ account: accountId, refresh_url: APP + '/api/stripe/connect/authorize', return_url: APP + '/api/stripe/connect/callback?account_id=' + accountId + '&tenant_id=' + tenant.id, type: 'account_onboarding' });
  return NextResponse.redirect(link.url);
}
