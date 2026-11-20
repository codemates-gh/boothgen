import { describe, it, expect } from 'vitest';
import { summarizeEventLedger, type EventLedgerRow } from '@/lib/events/eventLedger';

// Report #14: income and expenses entered by hand in Bookkeeping and linked to an event count on the event
const row = (id: string, type: 'INCOME' | 'EXPENSE', amountCents: number): EventLedgerRow =>
  ({ id, type, amountCents, date: '2026-11-19T12:00:00.000Z', description: id });

describe('summarizeEventLedger', () => {
  it('adds hand-entered income and expenses separately', () => {
    const s = summarizeEventLedger([row('cash', 'INCOME', 50000), row('tip', 'INCOME', 2500), row('parking', 'EXPENSE', 1800)]);
    expect(s.incomeCents).toBe(52500);
    expect(s.expenseCents).toBe(1800);
    expect(s.income.map(r => r.id)).toEqual(['cash', 'tip']);
    expect(s.expenses.map(r => r.id)).toEqual(['parking']);
  });

  it('lets hand-entered refunds (negative income) lower the income', () => {
    const s = summarizeEventLedger([row('cash', 'INCOME', 50000), row('refund', 'INCOME', -10000)]);
    expect(s.incomeCents).toBe(40000);
    expect(s.income).toHaveLength(2);
  });

  it('skips $0 rows and is empty with nothing linked', () => {
    expect(summarizeEventLedger([row('zero', 'INCOME', 0)])).toEqual({ income: [], expenses: [], incomeCents: 0, expenseCents: 0 });
    expect(summarizeEventLedger([])).toEqual({ income: [], expenses: [], incomeCents: 0, expenseCents: 0 });
  });
});
