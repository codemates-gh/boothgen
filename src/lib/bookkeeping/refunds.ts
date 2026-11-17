// Refunds of invoice payments made in Stripe (BoothGen's Stripe dashboard, or the API), recorded from the
// charge.refunded webhook. Stripe sends the running total refunded on the charge, so partial refunds add up correctly.
//
// One refund line per payment:
//   • a payment-schedule payment already refunded by Cancel Event (its "refund:milestone:<id>" line) is updated
//   • otherwise a "stripe-refund:<payment intent>" line is added or updated
// syncLedger skips the milestone line when a stripe-refund line exists, so the same refund is never counted twice.
import { prisma } from '@/lib/prisma/client';
import { clientDisplayName } from '@/lib/clientName';
import { categoryId } from './categories';

export const STRIPE_REFUND = 'stripe-refund';

export async function recordStripeRefund(paymentIntentId: string | null | undefined, amountRefunded: number): Promise<boolean> {
  if (!paymentIntentId || amountRefunded <= 0) return false;
  const milestone = await prisma.paymentMilestone.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true, label: true, invoice: { select: { id: true, tenantId: true, invoiceNumber: true, eventId: true, clientId: true, client: { select: { firstName: true, lastName: true, company: true } } } } },
  });
  const invoice = milestone?.invoice ?? await prisma.invoice.findFirst({
    where: { stripePaymentIntentId: paymentIntentId },
    select: { id: true, tenantId: true, invoiceNumber: true, eventId: true, clientId: true, client: { select: { firstName: true, lastName: true, company: true } } },
  });
  if (!invoice) return false; // not an invoice payment (e.g. a Genie event payment)

  const tenantId = invoice.tenantId;
  if (milestone) {
    const viaCancel = await prisma.ledgerTransaction.findUnique({ where: { tenantId_sourceKey: { tenantId, sourceKey: 'refund:milestone:' + milestone.id } } });
    if (viaCancel) {
      await prisma.ledgerTransaction.update({ where: { id: viaCancel.id }, data: { amountCents: -amountRefunded } });
      return true;
    }
  }
  const payee = clientDisplayName(invoice.client);
  const sourceKey = STRIPE_REFUND + ':' + paymentIntentId;
  await prisma.ledgerTransaction.upsert({
    where: { tenantId_sourceKey: { tenantId, sourceKey } },
    update: { amountCents: -amountRefunded },
    create: {
      tenantId, sourceKey, source: STRIPE_REFUND, type: 'INCOME', date: new Date(), amountCents: -amountRefunded,
      description: `Refund for invoice ${invoice.invoiceNumber}${milestone ? ` (${milestone.label})` : ''} - ${payee} (Stripe)`,
      payee, invoiceId: invoice.id, eventId: invoice.eventId, clientId: invoice.clientId,
      categoryId: await categoryId(tenantId, 'INCOME', 'Refunds'),
    },
  });
  return true;
}
