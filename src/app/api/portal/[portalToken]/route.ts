export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';
import { sendPaymentConfirmationEmail } from '@/lib/email/send';

export async function GET(_: NextRequest, { params }: { params: { portalToken: string } }) {
  const event = await prisma.event.findFirst({
    where: { portalToken: params.portalToken },
    include: {
      client: true,
      tenant: { include: { branding: { select: { companyName: true, logoUrl: true, primaryColor: true, replyToEmail: true } } } },
      invoices: { include: { lineItems: { orderBy: { sortOrder: 'asc' } }, PaymentMilestone: { orderBy: { dueDate: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 1 },
      contracts: { orderBy: { createdAt: 'desc' }, take: 1 },
      Quote: { include: { lineItems: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 1 },
      gallery: { include: { assets: { where: { approvalStatus: 'APPROVED' }, orderBy: { createdAt: 'asc' } } } },
      templateDesigns: { orderBy: { version: 'desc' } },
    },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Mark quote as viewed
  if (event.Quote[0]?.status === 'SENT') {
    await prisma.quote.update({ where: { id: event.Quote[0].id }, data: { status: 'VIEWED', viewedAt: new Date() } });
  }

  // Reconcile invoice against Stripe if webhook hasn't fired yet
  let rawInvoice = event.invoices[0] || null;
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  const companyName = event.tenant.branding?.companyName ?? event.tenant.name;
  const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
  const portalUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com') + '/portal/' + params.portalToken + '?tab=invoice';

  if (rawInvoice && rawInvoice.status !== 'PAID') {
    try {
      // ── 1. Full-invoice PI (no milestones) ────────────────────────────────
      if (rawInvoice.stripePaymentIntentId) {
        const pi = await stripe.paymentIntents.retrieve(rawInvoice.stripePaymentIntentId);
        if (pi.status === 'succeeded') {
          rawInvoice = await prisma.invoice.update({
            where: { id: rawInvoice.id },
            data: { status: 'PAID', paidAt: new Date(), amountPaidCents: rawInvoice.totalCents, balanceDueCents: 0 },
            include: { lineItems: { orderBy: { sortOrder: 'asc' } }, PaymentMilestone: { orderBy: { dueDate: 'asc' } } },
          });
          sendPaymentConfirmationEmail({
            to: event.client.email, firstName: event.client.firstName, companyName,
            invoiceNumber: rawInvoice.invoiceNumber, amountPaidFormatted: fmt(rawInvoice.totalCents),
            eventTitle: event.title, portalUrl,
            replyTo: event.tenant.branding?.replyToEmail ?? undefined,
            from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
          }).catch(e => console.error('[portal-reconcile] email error:', e));
        }
      }

      // ── 2. Milestone PIs (partial payments) ───────────────────────────────
      if (rawInvoice.status !== 'PAID') {
        const unpaidMilestones = ((rawInvoice as any).PaymentMilestone ?? []).filter(
          (m: any) => m.status !== 'PAID' && m.stripePaymentIntentId
        );

        let anySettled = false;
        for (const ms of unpaidMilestones) {
          try {
            const pi = await stripe.paymentIntents.retrieve(ms.stripePaymentIntentId);
            if (pi.status === 'succeeded') {
              await prisma.paymentMilestone.update({
                where: { id: ms.id },
                data: { status: 'PAID', paidAt: new Date() },
              });
              anySettled = true;
            }
          } catch { /* individual PI unavailable — skip */ }
        }

        if (anySettled) {
          // Recalculate invoice totals from all milestones
          const allMilestones = await prisma.paymentMilestone.findMany({ where: { invoiceId: rawInvoice.id } });
          const paidCents = allMilestones.filter((m: any) => m.status === 'PAID').reduce((s: number, m: any) => s + m.amountCents, 0);
          const balanceCents = rawInvoice.totalCents - paidCents;
          const newStatus = balanceCents <= 0 ? 'PAID' : 'PARTIALLY_PAID';

          rawInvoice = await prisma.invoice.update({
            where: { id: rawInvoice.id },
            data: {
              amountPaidCents: paidCents,
              balanceDueCents: balanceCents,
              status: newStatus,
              ...(newStatus === 'PAID' ? { paidAt: new Date() } : {}),
            },
            include: { lineItems: { orderBy: { sortOrder: 'asc' } }, PaymentMilestone: { orderBy: { dueDate: 'asc' } } },
          });

          if (newStatus === 'PAID') {
            sendPaymentConfirmationEmail({
              to: event.client.email, firstName: event.client.firstName, companyName,
              invoiceNumber: rawInvoice.invoiceNumber, amountPaidFormatted: fmt(rawInvoice.totalCents),
              eventTitle: event.title, portalUrl,
              replyTo: event.tenant.branding?.replyToEmail ?? undefined,
              from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
            }).catch(e => console.error('[portal-reconcile] email error:', e));
          }
        }
      }
    } catch { /* Stripe unavailable — return DB state as-is */ }
  }

  // Normalize invoice: rename PaymentMilestone → milestones for frontend
  const invoice = rawInvoice
    ? { ...rawInvoice, milestones: (rawInvoice as any).PaymentMilestone ?? [], PaymentMilestone: undefined }
    : null;

  return NextResponse.json({
    event: { ...event, Quote: undefined, invoices: undefined, contracts: undefined, gallery: undefined, templateDesigns: undefined },
    client: event.client,
    tenant: event.tenant,
    quote: event.Quote[0] || null,
    contract: event.contracts[0] || null,
    invoice,
    gallery: event.gallery ? { ...event.gallery, assets: undefined } : null,
    assets: event.gallery?.assets || [],
    templateDesigns: event.templateDesigns || [],
  });
}
