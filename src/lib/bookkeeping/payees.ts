// Auto-categorize by payee: Bookkeeping remembers the category you used for a payee.
//   • a new transaction with a payee and no category gets the category last used for that payee
//   • categorizing a transaction also fills in other uncategorized ones of the same kind from that payee
// Matching ignores case and spaces at the ends. Categorized transactions are never changed.
import { prisma } from '@/lib/prisma/client';
import type { LedgerType } from '@prisma/client';

const clean = (p: string | null | undefined) => (p ?? '').trim();

// The category last used for this payee (same income/expense kind), or null
export async function categoryForPayee(tenantId: string, type: LedgerType, payee: string | null | undefined): Promise<string | null> {
  const name = clean(payee);
  if (!name) return null;
  const last = await prisma.ledgerTransaction.findFirst({
    where: { tenantId, type, payee: { equals: name, mode: 'insensitive' }, categoryId: { not: null }, category: { hidden: false } },
    orderBy: [{ updatedAt: 'desc' }],
    select: { categoryId: true },
  });
  return last?.categoryId ?? null;
}

// After categorizing these rows: give the same category to uncategorized rows from the same payees. Returns how many.
export async function categorizeSamePayee(tenantId: string, rowIds: string[], categoryId: string): Promise<number> {
  const rows = await prisma.ledgerTransaction.findMany({ where: { tenantId, id: { in: rowIds }, categoryId }, select: { type: true, payee: true } });
  let count = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const name = clean(r.payee);
    const key = r.type + ':' + name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const u = await prisma.ledgerTransaction.updateMany({
      where: { tenantId, type: r.type, categoryId: null, payee: { equals: name, mode: 'insensitive' } },
      data: { categoryId },
    });
    count += u.count;
  }
  return count;
}
