export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { markInvoicePaid } from '@/lib/invoices/payments';

// Full-payment invoice (no payment schedule) paid outside Stripe. Milestone invoices use milestones/[id]/mark-paid.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Plan gate: same as marking a milestone paid
  const subscription = await prisma.stripeSubscription.findUnique({ where: { tenantId: session.tenantId } });
  const isPro = subscription?.plan === 'MONTHLY' || subscription?.plan === 'ANNUAL' || subscription?.plan === 'LIFETIME';
  if (!isPro) return NextResponse.json({ error: 'Upgrade required', upgradeRequired: true }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const paymentMethod = typeof body.paymentMethod === 'string' && body.paymentMethod.trim() ? body.paymentMethod.trim().slice(0, 40) : null;
  const r = await markInvoicePaid(session.tenantId, params.id, paymentMethod);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ success: true, ...r });
}
