// Fills the ledger from what BoothGen already knows, so most income needs no typing:
//   • each paid payment-schedule payment, and each paid invoice without a schedule → income ("Sales")
//   • the BoothGen processing fee on each Stripe payment (application fee) → expense ("Merchant Fees")
//   • Genie per-event payments the operator made → expense ("Software & Subscriptions")
// Rows are keyed by sourceKey, so running it again only adds what's new. If a payment is undone (unmarked paid), its
// row is removed. The operator's own edits (category, notes, receipt, event, verified) are kept.
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';
import { clientDisplayName } from '@/lib/clientName';
import { AUTO_CATEGORY, categoryId, ensureCategories } from './categories';

type AutoRow = {
  sourceKey: string; source: 'payment' | 'fee' | 'genie'; type: 'INCOME' | 'EXPENSE';
  date: Date; amountCents: number; description: string; payee: string | null;
  invoiceId: string | null; eventId: string | null; clientId: string | null;
};

const AUTO_SOURCES = ['payment', 'fee', 'genie'];

export async function syncLedger(tenantId: string): Promise<{ added: number; removed: number }> {
  await ensureCategories(tenantId);
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, OR: [{ status: { in: ['PAID', 'PARTIALLY_PAID'] } }, { PaymentMilestone: { some: { status: 'PAID' } } }] },
    select: {
      id: true, invoiceNumber: true, status: true, totalCents: true, amountPaidCents: true, paidAt: true, updatedAt: true,
      stripePaymentIntentId: true, eventId: true, clientId: true,
      client: { select: { firstName: true, lastName: true, company: true } },
      PaymentMilestone: { where: { status: 'PAID' }, select: { id: true, label: true, amountCents: true, paidAt: true, stripePaymentIntentId: true } },
      payments: { select: { id: true, amountCents: true, paidAt: true, paymentMethod: true, stripePaymentIntentId: true } },
    },
  });

  const rows: AutoRow[] = [];
  const paymentIntents = new Map<string, { date: Date; invoiceId: string; eventId: string | null; clientId: string; number: string; payee: string }>();
  for (const inv of invoices) {
    const payee = clientDisplayName(inv.client);
    const base = { invoiceId: inv.id, eventId: inv.eventId, clientId: inv.clientId, payee };
    if (inv.PaymentMilestone.length > 0) {
      for (const m of inv.PaymentMilestone) {
        if (m.amountCents <= 0) continue;
        rows.push({ ...base, sourceKey: 'milestone:' + m.id, source: 'payment', type: 'INCOME', date: m.paidAt ?? inv.updatedAt, amountCents: m.amountCents, description: `Payment for invoice ${inv.invoiceNumber} (${m.label}) - ${payee}` });
        if (m.stripePaymentIntentId) paymentIntents.set(m.stripePaymentIntentId, { date: m.paidAt ?? inv.updatedAt, invoiceId: inv.id, eventId: inv.eventId, clientId: inv.clientId, number: inv.invoiceNumber, payee });
      }
    } else if (inv.status === 'PAID' && inv.totalCents > 0) {
      if (inv.payments.length > 0) {
        for (const p of inv.payments) {
          if (p.amountCents <= 0) continue;
          rows.push({ ...base, sourceKey: 'payment:' + p.id, source: 'payment', type: 'INCOME', date: p.paidAt, amountCents: p.amountCents, description: `Payment for invoice ${inv.invoiceNumber} - ${payee}` + (p.paymentMethod ? ` (${p.paymentMethod})` : '') });
        }
      } else {
        rows.push({ ...base, sourceKey: 'invoice:' + inv.id, source: 'payment', type: 'INCOME', date: inv.paidAt ?? inv.updatedAt, amountCents: inv.amountPaidCents || inv.totalCents, description: `Payment for invoice ${inv.invoiceNumber} - ${payee}` });
      }
    }
    if (inv.stripePaymentIntentId && inv.status === 'PAID') {
      paymentIntents.set(inv.stripePaymentIntentId, { date: inv.paidAt ?? inv.updatedAt, invoiceId: inv.id, eventId: inv.eventId, clientId: inv.clientId, number: inv.invoiceNumber, payee });
    }
  }

  // Genie per-event payments (the operator paying BoothGen for a booth event)
  const genie = await prisma.genieEventPayment.findMany({ where: { tenantId, status: 'paid' }, select: { id: true, amountCents: true, paidAt: true, createdAt: true, eventId: true, event: { select: { title: true } } } });
  for (const g of genie) {
    if (g.amountCents <= 0) continue;
    rows.push({ sourceKey: 'genie:' + g.id, source: 'genie', type: 'EXPENSE', date: g.paidAt ?? g.createdAt, amountCents: g.amountCents, description: `Genie booth event: ${g.event?.title ?? 'event'}`, payee: 'BoothGen', invoiceId: null, eventId: g.eventId, clientId: null });
  }

  const existing = await prisma.ledgerTransaction.findMany({ where: { tenantId, source: { in: AUTO_SOURCES }, sourceKey: { not: null } }, select: { id: true, sourceKey: true, amountCents: true, date: true } });
  const have = new Map(existing.map(e => [e.sourceKey!, e]));

  // Processing fees: looked up in Stripe once, for payments not already in the ledger
  for (const [pi, info] of paymentIntents) {
    const key = 'fee:' + pi;
    if (have.has(key)) { rows.push({ sourceKey: key, source: 'fee', type: 'EXPENSE', date: info.date, amountCents: have.get(key)!.amountCents, description: '', payee: null, invoiceId: info.invoiceId, eventId: info.eventId, clientId: info.clientId }); continue; }
    try {
      const intent = await stripe.paymentIntents.retrieve(pi);
      const fee = intent.application_fee_amount ?? 0;
      // A $0 fee is still recorded (and hidden from lists and reports) so Stripe isn't asked again on every sync
      rows.push({ sourceKey: key, source: 'fee', type: 'EXPENSE', date: info.date, amountCents: fee, description: `Processing fee (invoice ${info.number})`, payee: 'BoothGen', invoiceId: info.invoiceId, eventId: info.eventId, clientId: info.clientId });
    } catch (e) {
      console.error('[bookkeeping] fee lookup failed for', pi, (e as Error).message); // try again next sync
    }
  }

  const keep = new Set(rows.map(r => r.sourceKey));
  const cats = {
    payment: await categoryId(tenantId, 'INCOME', AUTO_CATEGORY.payment),
    fee: await categoryId(tenantId, 'EXPENSE', AUTO_CATEGORY.fee),
    genie: await categoryId(tenantId, 'EXPENSE', AUTO_CATEGORY.genie),
  };
  let added = 0;
  for (const r of rows) {
    const prev = have.get(r.sourceKey);
    if (!prev) {
      await prisma.ledgerTransaction.create({ data: { tenantId, ...r, categoryId: cats[r.source] } });
      added++;
    } else if (r.source !== 'fee' && (prev.amountCents !== r.amountCents || prev.date.getTime() !== r.date.getTime())) {
      await prisma.ledgerTransaction.update({ where: { id: prev.id }, data: { amountCents: r.amountCents, date: r.date } });
    }
  }
  const gone = existing.filter(e => !keep.has(e.sourceKey!)).map(e => e.id);
  if (gone.length) await prisma.ledgerTransaction.deleteMany({ where: { id: { in: gone } } });
  return { added, removed: gone.length };
}
