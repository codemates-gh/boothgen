export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma/client';
import { sendPaymentConfirmationEmail } from '@/lib/email/send';
import type Stripe from 'stripe';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = headers().get('stripe-signature');
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 });

  // Try both secrets — Destination 1 (payments) and Destination 2 (connect accounts)
  const secrets = [
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
  ].filter(Boolean) as string[];

  let event: Stripe.Event | null = null;
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, secret);
      break;
    } catch {}
  }

  if (!event) {
    console.error('[stripe-webhook] signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {

      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        const { invoiceId, milestoneId } = pi.metadata;

        if (milestoneId) {
          const milestone = await prisma.paymentMilestone.update({
            where: { id: milestoneId },
            data: { status: 'PAID', paidAt: new Date(), stripePaymentIntentId: pi.id },
            include: { invoice: { include: { PaymentMilestone: true } } },
          });
          const updated = (milestone.invoice as any).PaymentMilestone.map((m: any) =>
            m.id === milestoneId ? { ...m, status: 'PAID' as const } : m
          );
          const paidCents    = updated.filter((m: any) => m.status === 'PAID').reduce((s: number, m: any) => s + m.amountCents, 0);
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
          const inv = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
              event: { include: { client: true } },
              tenant: { include: { branding: { select: { companyName: true, replyToEmail: true } } } },
            },
          });
          if (inv) {
            await prisma.invoice.update({
              where: { id: invoiceId },
              data: {
                status: 'PAID', paidAt: new Date(),
                amountPaidCents: inv.totalCents, balanceDueCents: 0,
                stripePaymentIntentId: pi.id,
              },
            });
            if (inv.event?.client) {
              const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
              const companyName = inv.tenant.branding?.companyName ?? inv.tenant.name;
              const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
              sendPaymentConfirmationEmail({
                to: inv.event.client.email,
                firstName: inv.event.client.firstName,
                companyName,
                invoiceNumber: inv.invoiceNumber,
                amountPaidFormatted: fmt(inv.totalCents),
                eventTitle: inv.event.title,
                portalUrl: APP_URL + '/portal/' + inv.event.portalToken + '?tab=invoice',
                replyTo: inv.tenant.branding?.replyToEmail ?? undefined,
                from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
              }).catch(e => console.error('[stripe-webhook] confirmation email error:', e));
            }
          }
        }
        break;
      }

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
