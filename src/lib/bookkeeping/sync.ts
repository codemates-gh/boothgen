// Fills the ledger from what BoothGen already knows, so most income needs no typing:
//   • each paid payment-schedule payment, and each paid invoice without a schedule → income ("Sales")
//   • the BoothGen processing fee on each Stripe payment (application fee) → expense ("Merchant Fees")
//   • Genie per-event payments the operator made → expense ("Software & Subscriptions")
//   • refunded payments (cancelling an event with a refund) → a negative "Refunds" line; the payment itself stays
//   • each event's Print Log (prints × cost per print) → expense ("Print Media"), dated on the event
//   • expenses on an event's Profitability card → expense in the matching category, dated on the event
// Rows are keyed by sourceKey, so running it again only adds what's new. If a payment is undone (unmarked paid), its
// row is removed. The operator's own edits (category, notes, receipt, event, verified) are kept.
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';
import { clientDisplayName } from '@/lib/clientName';
import { AUTO_CATEGORY, EVENT_EXPENSE_CATEGORY, categoryId, ensureCategories } from './categories';
import { fmtCents } from '@/lib/utils';

type Source = 'payment' | 'fee' | 'genie' | 'refund' | 'print' | 'event';
type AutoRow = {
  sourceKey: string; source: Source; type: 'INCOME' | 'EXPENSE'; categoryName?: string;
  date: Date; amountCents: number; description: string; payee: string | null;
  invoiceId: string | null; eventId: string | null; clientId: string | null;
};

export const AUTO_SOURCES: Source[] = ['payment', 'fee', 'genie', 'refund', 'print', 'event'];

export async function syncLedger(tenantId: string): Promise<{ added: number; removed: number }> {
  await ensureCategories(tenantId);
  const invoices = await prisma.invoice.findMany({
    where: { tenantId, OR: [
      { status: { in: ['PAID', 'PARTIALLY_PAID'] } },
      { PaymentMilestone: { some: { status: { in: ['PAID', 'REFUNDED'] } } } },
      { status: 'CANCELLED', payments: { some: { amountCents: { lt: 0 } } } }, // paid in full, then refunded by Cancel Event
    ] },
    select: {
      id: true, invoiceNumber: true, status: true, totalCents: true, amountPaidCents: true, paidAt: true, updatedAt: true,
      stripePaymentIntentId: true, eventId: true, clientId: true,
      client: { select: { firstName: true, lastName: true, company: true } },
      currency: true,
      PaymentMilestone: { where: { status: { in: ['PAID', 'REFUNDED'] } }, select: { id: true, label: true, amountCents: true, paidAt: true, status: true, stripePaymentIntentId: true } },
      payments: { select: { id: true, amountCents: true, paidAt: true, paymentMethod: true, stripePaymentIntentId: true } },
    },
  });

  // Payments already refunded through Stripe have their own line (src/lib/bookkeeping/refunds.ts)
  const stripeRefunded = new Set((await prisma.ledgerTransaction.findMany({ where: { tenantId, source: 'stripe-refund' }, select: { sourceKey: true } }))
    .map(r => r.sourceKey!.slice('stripe-refund:'.length)));
  const rows: AutoRow[] = [];
  const paymentIntents = new Map<string, { date: Date; invoiceId: string; eventId: string | null; clientId: string; number: string; payee: string }>();
  for (const inv of invoices) {
    const payee = clientDisplayName(inv.client);
    const base = { invoiceId: inv.id, eventId: inv.eventId, clientId: inv.clientId, payee };
    if (inv.PaymentMilestone.length > 0) {
      for (const m of inv.PaymentMilestone) {
        if (m.amountCents <= 0) continue;
        rows.push({ ...base, sourceKey: 'milestone:' + m.id, source: 'payment', type: 'INCOME', date: m.paidAt ?? inv.updatedAt, amountCents: m.amountCents, description: `Payment for invoice ${inv.invoiceNumber} (${m.label}) - ${payee}` });
        if (m.status === 'REFUNDED' && !(m.stripePaymentIntentId && stripeRefunded.has(m.stripePaymentIntentId))) {
          // Dated when BoothGen first sees the refund (kept after that)
          rows.push({ ...base, sourceKey: 'refund:milestone:' + m.id, source: 'refund', type: 'INCOME', date: new Date(), amountCents: -m.amountCents, description: `Refund for invoice ${inv.invoiceNumber} (${m.label}) - ${payee}` });
        }
        if (m.stripePaymentIntentId) paymentIntents.set(m.stripePaymentIntentId, { date: m.paidAt ?? inv.updatedAt, invoiceId: inv.id, eventId: inv.eventId, clientId: inv.clientId, number: inv.invoiceNumber, payee });
      }
    } else if ((inv.status === 'PAID' || inv.status === 'CANCELLED') && inv.totalCents > 0) {
      const paid = inv.payments.filter(p => p.amountCents > 0);
      if (paid.length > 0) {
        for (const p of paid) {
          rows.push({ ...base, sourceKey: 'payment:' + p.id, source: 'payment', type: 'INCOME', date: p.paidAt, amountCents: p.amountCents, description: `Payment for invoice ${inv.invoiceNumber} - ${payee}` + (p.paymentMethod ? ` (${p.paymentMethod})` : '') });
        }
      } else if (inv.amountPaidCents > 0 || inv.status === 'PAID') {
        rows.push({ ...base, sourceKey: 'invoice:' + inv.id, source: 'payment', type: 'INCOME', date: inv.paidAt ?? inv.updatedAt, amountCents: inv.amountPaidCents || inv.totalCents, description: `Payment for invoice ${inv.invoiceNumber} - ${payee}` });
      }
      // Refunds recorded on the invoice by Cancel Event (negative payments). A Stripe refund already recorded from
      // Stripe's notification (src/lib/bookkeeping/refunds.ts) isn't added again.
      for (const p of inv.payments.filter(p => p.amountCents < 0)) {
        if (p.stripePaymentIntentId && stripeRefunded.has(p.stripePaymentIntentId)) continue;
        rows.push({ ...base, sourceKey: 'refund:payment:' + p.id, source: 'refund', type: 'INCOME', date: p.paidAt, amountCents: p.amountCents, description: `Refund for invoice ${inv.invoiceNumber} - ${payee}` + (p.stripePaymentIntentId ? ' (Stripe)' : '') });
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

  // Print costs from each event's Print Log
  const printLogs = await prisma.eventPrintLog.findMany({
    where: { tenantId, printCount: { gt: 0 } },
    select: { eventId: true, printCount: true, consumableProfile: { select: { name: true, costPerPrintCents: true } }, event: { select: { title: true, eventDate: true, clientId: true } } },
  });
  for (const pl of printLogs) {
    const cpp = pl.consumableProfile?.costPerPrintCents ?? 0;
    if (cpp <= 0) continue;
    rows.push({ sourceKey: 'print:' + pl.eventId, source: 'print', type: 'EXPENSE', date: pl.event.eventDate, amountCents: pl.printCount * cpp,
      description: `Prints for ${pl.event.title}: ${pl.printCount.toLocaleString()} × ${fmtCents(cpp)}` + (pl.consumableProfile?.name ? ` (${pl.consumableProfile.name})` : ''),
      payee: null, invoiceId: null, eventId: pl.eventId, clientId: pl.event.clientId });
  }

  // Expenses entered on an event's Profitability card
  const eventExpenses = await prisma.eventExpense.findMany({
    where: { tenantId, amountCents: { gt: 0 } },
    select: { id: true, description: true, amountCents: true, category: true, eventId: true, event: { select: { title: true, eventDate: true, clientId: true } } },
  });
  for (const e of eventExpenses) {
    rows.push({ sourceKey: 'eventexpense:' + e.id, source: 'event', type: 'EXPENSE', date: e.event.eventDate, amountCents: e.amountCents,
      description: `${e.description} (${e.event.title})`, categoryName: EVENT_EXPENSE_CATEGORY[e.category] ?? 'Other Expenses',
      payee: null, invoiceId: null, eventId: e.eventId, clientId: e.event.clientId });
  }

  const existing = await prisma.ledgerTransaction.findMany({ where: { tenantId, source: { in: AUTO_SOURCES }, sourceKey: { not: null } }, select: { id: true, sourceKey: true, amountCents: true, date: true, description: true } });
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
  const catCache = new Map<string, string>();
  const cat = async (r: AutoRow) => {
    const name = r.categoryName ?? (AUTO_CATEGORY as Record<string, string>)[r.source];
    const key = r.type + ':' + name;
    if (!catCache.has(key)) catCache.set(key, await categoryId(tenantId, r.type, name));
    return catCache.get(key)!;
  };
  let added = 0;
  for (const r of rows) {
    const prev = have.get(r.sourceKey);
    const { categoryName: _c, ...data } = r;
    if (!prev) {
      await prisma.ledgerTransaction.create({ data: { tenantId, ...data, categoryId: await cat(r) } });
      added++;
    } else if (r.source !== 'fee') {
      // Keep amounts in step with the source (a refund keeps the date it was first seen)
      const dateChanged = r.source !== 'refund' && prev.date.getTime() !== r.date.getTime();
      if (prev.amountCents !== r.amountCents || dateChanged || ((r.source === 'print' || r.source === 'event') && prev.description !== r.description)) {
        await prisma.ledgerTransaction.update({ where: { id: prev.id }, data: { amountCents: r.amountCents, ...(dateChanged ? { date: r.date } : {}), ...(r.source === 'print' || r.source === 'event' ? { description: r.description } : {}) } });
      }
    }
  }
  const gone = existing.filter(e => !keep.has(e.sourceKey!)).map(e => e.id);
  if (gone.length) await prisma.ledgerTransaction.deleteMany({ where: { id: { in: gone } } });
  return { added, removed: gone.length };
}
