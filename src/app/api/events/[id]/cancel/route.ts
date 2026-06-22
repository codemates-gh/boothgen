export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';
import { z } from 'zod';

const Schema = z.object({
  refundOption: z.enum(['none', 'deposit', 'all']),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { refundOption } = parsed.data;

  const event = await prisma.event.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: {
      invoices: {
        include: {
          PaymentMilestone: { where: { status: 'PAID' }, orderBy: { dueDate: 'asc' } },
        },
      },
    },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (event.status === 'CANCELLED') return NextResponse.json({ error: 'Already cancelled' }, { status: 400 });

  const refunded: string[] = [];
  const errors: string[] = [];

  if (refundOption !== 'none') {
    // Gather milestones to refund
    const allPaid = event.invoices.flatMap(inv => inv.PaymentMilestone);
    const toRefund = refundOption === 'deposit' ? allPaid.slice(0, 1) : allPaid;

    if (toRefund.length > 0) {
      // Fetch the tenant's Stripe Connect account
      const connectAccount = await prisma.stripeConnectAccount.findUnique({
        where: { tenantId: session.tenantId },
      });

      for (const milestone of toRefund) {
        if (!milestone.stripePaymentIntentId) {
          // Paid outside Stripe — mark REFUNDED without API call
          await prisma.paymentMilestone.update({
            where: { id: milestone.id },
            data: { status: 'REFUNDED' },
          });
          refunded.push(milestone.id);
          continue;
        }

        try {
          await stripe.refunds.create(
            { payment_intent: milestone.stripePaymentIntentId },
            connectAccount?.stripeAccountId ? { stripeAccount: connectAccount.stripeAccountId } : undefined,
          );
          await prisma.paymentMilestone.update({
            where: { id: milestone.id },
            data: { status: 'REFUNDED' },
          });
          refunded.push(milestone.id);
        } catch (err: any) {
          console.error('[cancel/refund] Stripe refund error:', err.message);
          errors.push(milestone.label + ': ' + (err.message ?? 'Unknown error'));
        }
      }

      // If any refund failed, return error before cancelling
      if (errors.length > 0) {
        return NextResponse.json({ error: 'Refund failed: ' + errors.join('; ') }, { status: 502 });
      }
    }
  }

  const updated = await prisma.event.update({
    where: { id: params.id },
    data: { status: 'CANCELLED' },
  });

  return NextResponse.json({ ...updated, refunded });
}
