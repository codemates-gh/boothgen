import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

// Statuses an unpaid invoice that has gone to the client can be in
export const OPEN_STATUSES = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] as const;

// Paid invoices move the event from lead/quote to booked (same as Stripe and milestone payments)
export async function bookEvent(db: Db, eventId: string | null) {
  if (!eventId) return;
  await db.event.updateMany({ where: { id: eventId, status: { in: ['LEAD', 'QUOTED'] } }, data: { status: 'BOOKED' } });
}

// Fields for an invoice created already sent: a $0 total has nothing to collect, so it starts paid
export function sentInvoiceFields(totalCents: number) {
  return totalCents <= 0
    ? { status: 'PAID' as const, paidAt: new Date(), amountPaidCents: 0, balanceDueCents: 0 }
    : { status: 'SENT' as const, amountPaidCents: 0, balanceDueCents: totalCents };
}
export const milestoneStatusFor = (amountCents: number) => (amountCents <= 0 ? { status: 'PAID' as const, paidAt: new Date() } : {});

// A $0 invoice that has been sent counts as paid: marks it and its milestones paid and books the event.
// Returns true when it changed anything.
export async function settleZeroInvoice(db: Db, invoiceId: string): Promise<boolean> {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, totalCents: true, status: true, eventId: true } });
  if (!inv || inv.totalCents > 0 || !(OPEN_STATUSES as readonly string[]).includes(inv.status)) return false;
  const now = new Date();
  await db.invoice.update({ where: { id: inv.id }, data: { status: 'PAID', paidAt: now, amountPaidCents: 0, balanceDueCents: 0 } });
  await db.paymentMilestone.updateMany({ where: { invoiceId: inv.id, status: { not: 'PAID' } }, data: { status: 'PAID', paidAt: now } });
  await bookEvent(db, inv.eventId);
  return true;
}

// Full-payment invoice (no milestones) paid outside Stripe: recorded as a Payment row so it can be undone
export async function markInvoicePaid(tenantId: string, invoiceId: string, paymentMethod: string | null) {
  return prisma.$transaction(async tx => {
    const inv = await tx.invoice.findFirst({ where: { id: invoiceId, tenantId }, include: { _count: { select: { PaymentMilestone: true } } } });
    if (!inv) return { error: 'Not found', status: 404 } as const;
    if (inv._count.PaymentMilestone > 0) return { error: 'This invoice has a payment schedule. Mark each payment as paid instead.', status: 400 } as const;
    if (inv.status === 'PAID') return { error: 'Already paid', status: 400 } as const;
    if (inv.status === 'CANCELLED') return { error: 'This invoice is cancelled', status: 400 } as const;
    const now = new Date();
    await tx.payment.create({
      data: { tenantId, invoiceId, amountCents: inv.totalCents, currency: inv.currency, paymentMethod, notes: 'Marked paid', paidAt: now },
    });
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'PAID', paidAt: now, amountPaidCents: inv.totalCents, balanceDueCents: 0 } });
    await bookEvent(tx, inv.eventId);
    return { invoiceStatus: 'PAID' as const, paymentMethod };
  });
}

// Undo a manual full payment. Payments collected through Stripe are refunded in Stripe instead.
export async function unmarkInvoicePaid(tenantId: string, invoiceId: string) {
  return prisma.$transaction(async tx => {
    const inv = await tx.invoice.findFirst({ where: { id: invoiceId, tenantId }, include: { _count: { select: { PaymentMilestone: true } } } });
    if (!inv) return { error: 'Not found', status: 404 } as const;
    if (inv._count.PaymentMilestone > 0) return { error: 'This invoice has a payment schedule. Undo each payment instead.', status: 400 } as const;
    if (inv.status !== 'PAID') return { error: 'This invoice is not marked as paid', status: 400 } as const;
    if (inv.totalCents <= 0) return { error: 'A $0 invoice is always paid', status: 400 } as const;
    const manual = await tx.payment.findMany({ where: { invoiceId, stripeChargeId: null, stripePaymentIntentId: null } });
    if (manual.length === 0) return { error: 'This payment was collected via Stripe and cannot be undone here. Issue a refund from your Stripe dashboard.', status: 400 } as const;
    await tx.payment.deleteMany({ where: { id: { in: manual.map(p => p.id) } } });
    await tx.invoice.update({ where: { id: invoiceId }, data: { status: 'SENT', paidAt: null, amountPaidCents: 0, balanceDueCents: inv.totalCents } });
    return { invoiceStatus: 'SENT' as const };
  });
}

// The method recorded when a full invoice was marked paid by hand
export async function manualPaymentMethod(invoiceId: string): Promise<string | null | undefined> {
  const p = await prisma.payment.findFirst({ where: { invoiceId, stripeChargeId: null, stripePaymentIntentId: null }, orderBy: { paidAt: 'desc' } });
  return p ? p.paymentMethod : undefined;
}
