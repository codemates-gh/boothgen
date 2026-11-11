export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { unmarkInvoicePaid } from '@/lib/invoices/payments';

// Undo "Mark as paid" on a full-payment invoice
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const subscription = await prisma.stripeSubscription.findUnique({ where: { tenantId: session.tenantId } });
  const isPro = subscription?.plan === 'MONTHLY' || subscription?.plan === 'ANNUAL' || subscription?.plan === 'LIFETIME';
  if (!isPro) return NextResponse.json({ error: 'Upgrade required', upgradeRequired: true }, { status: 403 });
  const r = await unmarkInvoicePaid(session.tenantId, params.id);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ success: true, ...r });
}
