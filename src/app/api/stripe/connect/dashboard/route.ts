export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';

// "View payouts in Stripe": the operator's own Stripe dashboard. Express accounts (what BoothGen creates) sign in
// with a one-time login link; Standard accounts use Stripe's own dashboard, which login links don't support.
const STANDARD_PAYOUTS_URL = 'https://dashboard.stripe.com/payouts';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connect = await prisma.stripeConnectAccount.findUnique({
    where: { tenantId: session.tenantId },
  });

  if (!connect?.stripeAccountId) {
    // Not connected yet — kick off onboarding
    return NextResponse.redirect(new URL('/api/stripe/connect/authorize', req.url));
  }
  if (connect.accountType !== 'express') return NextResponse.redirect(STANDARD_PAYOUTS_URL);

  try {
    const loginLink = await stripe.accounts.createLoginLink(connect.stripeAccountId);
    return NextResponse.redirect(loginLink.url);
  } catch (err) {
    // E.g. onboarding not finished: Stripe asks for the missing details first
    console.error('[stripe] login link failed', err);
    return NextResponse.redirect(new URL('/api/stripe/connect/authorize', req.url));
  }
}
