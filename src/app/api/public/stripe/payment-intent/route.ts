export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';
import { closedForClients } from '@/lib/genius';

export async function POST(req: NextRequest) {
  const { invoiceId, milestoneId } = await req.json();
  if (!invoiceId) {
    return NextResponse.json({ error: 'invoiceId required' }, { status: 400 });
  }

  const [invoice, commissionSetting] = await Promise.all([
    prisma.invoice.findUnique({
      where:   { id: invoiceId },
      include: {
        tenant: { include: { stripeConnect: true, stripeSubscription: true } },
        PaymentMilestone: true,
      },
    }),
    prisma.systemSetting.findUnique({ where: { key: 'commission_percentage' } }),
  ]);

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }
  { const closed = await closedForClients(invoice.tenantId); if (closed) return closed; } // Genie-only account: CRM is closed
  // No commission for Pro subscribers (MONTHLY/ANNUAL, ACTIVE or PAST_DUE), lifetime (founding) accounts, or accounts
  // marked "Keep Genius free"
  const sub = (invoice.tenant as any).stripeSubscription;
  const isPro = sub && (sub.plan === 'LIFETIME' || (
    ['MONTHLY', 'ANNUAL'].includes(sub.plan) &&
    ['ACTIVE', 'PAST_DUE'].includes(sub.status)));
  const noCommission = isPro || invoice.tenant.geniusFree;
  const commissionPct = parseFloat(commissionSetting?.value ?? '1.5');
  const feeFor = (cents: number) => noCommission ? 0 : Math.round(cents * (commissionPct / 100));

  if (invoice.status === 'PAID') {
    return NextResponse.json({ error: 'Invoice already paid' }, { status: 400 });
  }

  const connect = invoice.tenant.stripeConnect;
  if (!connect?.stripeAccountId || connect.onboardingStatus !== 'ACTIVE') {
    return NextResponse.json(
      { error: 'This host has not completed their payment setup yet.' },
      { status: 400 }
    );
  }

  let amountCents: number;
  const meta: Record<string, string> = {
    invoiceId: invoice.id,
    tenantId:  invoice.tenantId,
  };

  if (milestoneId) {
    const ms = (invoice as any).PaymentMilestone?.find((m: any) => m.id === milestoneId);
    if (!ms) {
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }
    if (ms.status === 'PAID') {
      return NextResponse.json({ error: 'Milestone already paid' }, { status: 400 });
    }
    amountCents       = ms.amountCents;
    meta.milestoneId  = milestoneId;

    // Reuse existing PaymentIntent if still usable
    if (ms.stripePaymentIntentId) {
      try {
        const ex = await stripe.paymentIntents.retrieve(ms.stripePaymentIntentId);
        if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(ex.status) && (ex.application_fee_amount ?? 0) === feeFor(amountCents)) {
          return NextResponse.json({ clientSecret: ex.client_secret });
        }
      } catch { /* stale PI — create a new one */ }
    }
  } else {
    amountCents = invoice.balanceDueCents;
    if (amountCents <= 0) {
      return NextResponse.json({ error: 'No balance due' }, { status: 400 });
    }

    // Reuse existing PaymentIntent if still usable
    if (invoice.stripePaymentIntentId) {
      try {
        const ex = await stripe.paymentIntents.retrieve(invoice.stripePaymentIntentId);
        if (['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(ex.status) && (ex.application_fee_amount ?? 0) === feeFor(amountCents)) {
          return NextResponse.json({ clientSecret: ex.client_secret });
        }
      } catch { /* stale PI — create a new one */ }
    }
  }

  const fee = feeFor(amountCents);

  const pi = await stripe.paymentIntents.create({
    amount:                  amountCents,
    currency:                invoice.currency ?? 'usd',
    ...(fee > 0 ? { application_fee_amount: fee } : {}),
    transfer_data:           { destination: connect.stripeAccountId },
    metadata:                meta,
    description:             'Invoice ' + invoice.invoiceNumber +
                               (milestoneId ? ' – milestone payment' : ''),
  });

  // Persist PI id for idempotency
  if (milestoneId) {
    await prisma.paymentMilestone.update({
      where: { id: milestoneId },
      data:  { stripePaymentIntentId: pi.id },
    });
  } else {
    await prisma.invoice.update({
      where: { id: invoiceId },
      data:  { stripePaymentIntentId: pi.id },
    });
  }

  return NextResponse.json({ clientSecret: pi.client_secret });
}
