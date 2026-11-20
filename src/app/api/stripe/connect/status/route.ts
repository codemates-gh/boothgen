export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

// Whether the operator's Stripe can take card payments, for the "View payouts in Stripe" button
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const c = await prisma.stripeConnectAccount.findUnique({ where: { tenantId: session.tenantId }, select: { stripeAccountId: true, chargesEnabled: true } });
  return NextResponse.json({ connected: !!c?.stripeAccountId && c.chargesEnabled });
}
