export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) {
    return NextResponse.redirect(new URL('/sign-in', req.url));
  }

  const connect = await prisma.stripeConnectAccount.findUnique({
    where: { tenantId: session.tenantId },
  });

  if (connect?.stripeAccountId) {
    const acct = await stripe.accounts.retrieve(connect.stripeAccountId);
    await prisma.stripeConnectAccount.update({
      where: { tenantId: session.tenantId },
      data: {
        onboardingStatus: acct.charges_enabled ? 'ACTIVE' : 'ONBOARDING_INITIATED',
        chargesEnabled:   acct.charges_enabled,
        payoutsEnabled:   acct.payouts_enabled,
        detailsSubmitted: acct.details_submitted,
        email:   acct.email   ?? undefined,
        country: acct.country ?? undefined,
        livemode: (acct as any).livemode ?? false,
      },
    });
  }

  const base   = process.env.NEXT_PUBLIC_APP_URL ?? req.url;
  const status = connect?.onboardingStatus === 'ACTIVE' ? 'connected' : 'pending';
  return NextResponse.redirect(new URL('/settings/billing?stripe=' + status, base));
}
