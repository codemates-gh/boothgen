import { prisma } from '@/lib/prisma/client';

// Report #14: money entered by hand in Bookkeeping and linked to an event also counts on the event's Profitability card.
// Only hand-entered rows (source "manual") are used: invoice payments are already in the event's Revenue, and expenses
// added on the event page are synced into Bookkeeping (source "event"), so counting those again would double them.
// Hand-entered refunds are negative income rows, so they lower Revenue (including refunds of invoice payments given
// outside Stripe, which the invoice itself doesn't know about).

export type EventLedgerRow = { id: string; date: string; description: string; type: 'INCOME' | 'EXPENSE'; amountCents: number };
export type EventLedgerSummary = { income: EventLedgerRow[]; expenses: EventLedgerRow[]; incomeCents: number; expenseCents: number };

export function summarizeEventLedger(rows: EventLedgerRow[]): EventLedgerSummary {
  const visible = rows.filter(r => r.amountCents !== 0);
  const income = visible.filter(r => r.type === 'INCOME');
  const expenses = visible.filter(r => r.type === 'EXPENSE');
  const sum = (list: EventLedgerRow[]) => list.reduce((s, r) => s + r.amountCents, 0);
  return { income, expenses, incomeCents: sum(income), expenseCents: sum(expenses) };
}

export async function eventLedgerSummary(tenantId: string, eventId: string): Promise<EventLedgerSummary> {
  const rows = await prisma.ledgerTransaction.findMany({
    where: { tenantId, eventId, source: 'manual', amountCents: { not: 0 } },
    select: { id: true, date: true, description: true, type: true, amountCents: true },
    orderBy: { date: 'asc' },
  });
  return summarizeEventLedger(rows.map(r => ({ ...r, date: r.date.toISOString() })));
}
