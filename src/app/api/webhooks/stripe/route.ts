export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma/client';
import type Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = headers().get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('[stripe-webhook] sig error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    switch (event.type) {

      // ── Invoice or milestone payment succeeded ──────────────────────────────
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { invoiceId, milestoneId } = pi.metadata;

        if (milestoneId) {
          // Mark milestone paid and recalculate invoice totals
          const milestone = await prisma.paymentMilestone.update({
            where: { id: milestoneId },
            data: {
              status:                'PAID',
              paidAt:                new Date(),
              stripePaymentIntentId: pi.id,
            },
            include: { invoice: { include: { milestones: true } } },
          });

          const updated = milestone.invoice.milestones.map(m =>
            m.id === milestoneId ? { ...m, status: 'PAID' as const } : m
          );
          const paidCents   = updated.filter(m => m.status === 'PAID').reduce((s, m) => s + m.amountCents, 0);
          const balanceCents = Math.max(0, milestone.invoice.totalCents - paidCents);

          await prisma.invoice.update({
            where: { id: milestone.invoiceId },
            data: {
              amountPaidCents: paidCents,
              balanceDueCents: balanceCents,
              status:  balanceCents <= 0 ? 'PAID' : 'PARTIALLY_PAID',
              paidAt:  balanceCents <= 0 ? new Date() : undefined,
            },
          });

        } else if (invoiceId) {
          // Full invoice payment
          const inv = await prisma.invoice.findUnique({ where: { id: invoiceId } });
          if (inv) {
            await prisma.invoice.update({
              where: { id: invoiceId },
              data: {
                status:                'PAID',
                paidAt:                new Date(),
                amountPaidCents:       inv.totalCents,
                balanceDueCents:       0,
                stripePaymentIntentId: pi.id,
              },
            });
          }
        }
        break;
      }

      // ── Host account updated (fires when onboarding completes) ──────────────
      case 'account.updated': {
        const acct = event.data.object as Stripe.Account;
        await prisma.stripeConnectAccount.updateMany({
          where: { stripeAccountId: acct.id },
          data: {
            onboardingStatus: acct.charges_enabled ? 'ACTIVE' : 'ONBOARDING_INITIATED',
            chargesEnabled:   acct.charges_enabled,
            payoutsEnabled:   acct.payouts_enabled,
            detailsSubmitted: acct.details_submitted,
          },
        });
        break;
      }
    }
  } catch (err) {
    console.error('[stripe-webhook] handler error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
