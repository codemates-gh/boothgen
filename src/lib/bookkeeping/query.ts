// Filters shared by the transaction list, CSV export and reports
import type { Prisma } from '@prisma/client';

export type LedgerFilters = {
  tab?: string | null; type?: string | null; categoryId?: string | null; source?: string | null; eventId?: string | null;
  from?: string | null; to?: string | null; amount?: string | null; q?: string | null;
};

export function ledgerWhere(tenantId: string, f: LedgerFilters): Prisma.LedgerTransactionWhereInput {
  const where: Prisma.LedgerTransactionWhereInput = { tenantId, amountCents: { gt: 0 } }; // $0 fee markers stay hidden
  if (f.tab === 'uncategorized') where.categoryId = null;
  if (f.tab === 'categorized') where.categoryId = { not: null };
  if (f.type === 'INCOME' || f.type === 'EXPENSE') where.type = f.type;
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.source === 'auto') where.source = { in: ['payment', 'fee', 'genie'] };
  if (f.source === 'manual') where.source = 'manual';
  if (f.eventId) where.eventId = f.eventId;
  const date: Prisma.DateTimeFilter = {};
  if (f.from) date.gte = new Date(f.from + 'T00:00:00');
  if (f.to) date.lte = new Date(f.to + 'T23:59:59.999');
  if (f.from || f.to) where.date = date;
  const amt = f.amount ? Math.round(parseFloat(f.amount.replace(/[$,]/g, '')) * 100) : NaN;
  if (Number.isFinite(amt) && amt > 0) where.amountCents = amt;
  if (f.q?.trim()) {
    const q = f.q.trim();
    where.OR = [
      { description: { contains: q, mode: 'insensitive' } },
      { payee: { contains: q, mode: 'insensitive' } },
      { notes: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

export function filtersFrom(sp: URLSearchParams): LedgerFilters {
  return { tab: sp.get('tab'), type: sp.get('type'), categoryId: sp.get('categoryId'), source: sp.get('source'), eventId: sp.get('eventId'), from: sp.get('from'), to: sp.get('to'), amount: sp.get('amount'), q: sp.get('q') };
}
