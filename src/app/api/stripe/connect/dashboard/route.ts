export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';

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
    return NextResponse.redirect(
      new URL('/api/stripe/connect/authorize', req.url)
    );
  }

  const loginLink = await stripe.accounts.createLoginLink(
    connect.stripeAccountId
  );
  return NextResponse.redirect(loginLink.url);
}
