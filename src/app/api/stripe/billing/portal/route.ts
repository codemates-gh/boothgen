export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sub = await prisma.stripeSubscription.findUnique({ where: { tenantId: session.tenantId } });
  if (!sub?.stripeCustomerId) return NextResponse.json({ error: 'No subscription found' }, { status: 404 });

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: APP_URL + '/settings/billing',
  });

  return NextResponse.redirect(portalSession.url);
}
