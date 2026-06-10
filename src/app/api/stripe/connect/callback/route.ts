
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma/client';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const APP = process.env.NEXT_PUBLIC_APP_URL!;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('account_id');
  const tenantId = searchParams.get('tenant_id');
  if (!accountId || !tenantId) return NextResponse.redirect(new URL('/settings/billing?error=invalid', APP));
  const record = await prisma.stripeConnectAccount.findFirst({ where: { stripeAccountId: accountId, tenantId } });
  if (!record) return NextResponse.redirect(new URL('/settings/billing?error=not_found', APP));
  const acct = await stripe.accounts.retrieve(accountId);
  const status = acct.charges_enabled && acct.payouts_enabled ? 'ACTIVE' : acct.charges_enabled ? 'RESTRICTED' : 'ONBOARDING_INITIATED';
  await prisma.stripeConnectAccount.update({ where: { id: record.id }, data: { onboardingStatus: status, chargesEnabled: acct.charges_enabled, payoutsEnabled: acct.payouts_enabled, detailsSubmitted: acct.details_submitted, email: acct.email ?? undefined, country: acct.country ?? undefined } });
  return NextResponse.redirect(new URL('/settings/billing?stripe_connect=' + (acct.charges_enabled ? 'success' : 'incomplete'), APP));
}
