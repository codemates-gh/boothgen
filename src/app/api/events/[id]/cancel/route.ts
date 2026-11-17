export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';
import { z } from 'zod';

// Invoice payments are taken on BoothGen's Stripe account and forwarded to the operator (transfer_data), so the refund
// is made there and reverse_transfer pulls the amount back from the operator's account. Payments made directly on the
// operator's account (older setup) are refunded there instead.
async function refundStripe(paymentIntentId: string, connectedAccountId: string | null | undefined) {
  try {
    await stripe.refunds.create({ payment_intent: paymentIntentId, reverse_transfer: true });
  } catch (err: any) {
    if (err?.code !== 'resource_missing' || !connectedAccountId) throw err;
    await stripe.refunds.create({ payment_intent: paymentIntentId }, { stripeAccount: connectedAccountId });
  }
}

const Schema = z.object({
  refundOption: z.enum(['none', 'deposit', 'all']),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
          PaymentMilestone: { orderBy: { dueDate: 'asc' } },
        },
      },
    },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (event.status === 'CANCELLED') return NextResponse.json({ error: 'Already cancelled' }, { status: 400 });

  const refunded: string[] = [];
  const errors: string[] = [];

  if (refundOption !== 'none') {
    // Payment-schedule payments to refund ("Refund deposit" = the first one paid)
    const allPaid = event.invoices.flatMap(inv => inv.PaymentMilestone.filter(m => m.status === 'PAID'));
    const toRefund = refundOption === 'deposit' ? allPaid.slice(0, 1) : allPaid;
    // "Refund all payments" also covers invoices paid in full with no payment schedule
    const fullPaid = refundOption === 'all'
      ? event.invoices.filter(inv => inv.PaymentMilestone.length === 0 && inv.status === 'PAID' && inv.amountPaidCents > 0)
      : [];

    if (toRefund.length > 0 || fullPaid.length > 0) {
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
          await refundStripe(milestone.stripePaymentIntentId, connectAccount?.stripeAccountId);
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

      // Full-payment invoices: refund the Stripe payment (or note a refund given outside Stripe), record it as a
      // negative payment so the invoice keeps its history and Bookkeeping shows the payment and the refund, and cancel it
      for (const inv of fullPaid) {
        try {
          if (inv.stripePaymentIntentId) await refundStripe(inv.stripePaymentIntentId, connectAccount?.stripeAccountId);
          await prisma.$transaction([
            prisma.payment.create({
              data: {
                tenantId: inv.tenantId, invoiceId: inv.id, amountCents: -inv.amountPaidCents, currency: inv.currency,
                stripePaymentIntentId: inv.stripePaymentIntentId, paymentMethod: 'Refund',
                notes: inv.stripePaymentIntentId ? 'Refunded through Stripe when the event was cancelled' : 'Refunded outside Stripe when the event was cancelled',
              },
            }),
            prisma.invoice.update({ where: { id: inv.id }, data: { status: 'CANCELLED', balanceDueCents: 0 } }),
          ]);
          refunded.push(inv.id);
        } catch (err: any) {
          console.error('[cancel/refund] Stripe refund error:', err.message);
          errors.push(inv.invoiceNumber + ': ' + (err.message ?? 'Unknown error'));
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
