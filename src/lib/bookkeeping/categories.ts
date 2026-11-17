// Bookkeeping categories: a starting set for photo booth businesses, created the first time an account opens
// Bookkeeping. Operators can add, rename and hide them (Bookkeeping → ⚙ Categories).
import { prisma } from '@/lib/prisma/client';
import type { LedgerType } from '@prisma/client';

export const DEFAULT_CATEGORIES: Record<LedgerType, string[]> = {
  INCOME: ['Sales', 'Add-ons', 'Travel Fees', 'Tips', 'Other Income'],
  EXPENSE: [
    'Merchant Fees', 'Print Media', 'Props & Backdrops', 'Equipment', 'Software & Subscriptions', 'Travel & Mileage',
    'Staff & Attendants', 'Marketing', 'Insurance', 'Rent & Storage', 'Other Expenses',
  ],
};

// Categories used for rows BoothGen fills in by itself
export const AUTO_CATEGORY = { payment: 'Sales', fee: 'Merchant Fees', genie: 'Software & Subscriptions' } as const;

// Make sure the account has its categories; returns them all (hidden included)
export async function ensureCategories(tenantId: string) {
  const existing = await prisma.ledgerCategory.findMany({ where: { tenantId }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
  if (existing.length > 0) return existing;
  await prisma.ledgerCategory.createMany({
    data: (Object.keys(DEFAULT_CATEGORIES) as LedgerType[]).flatMap(type =>
      DEFAULT_CATEGORIES[type].map((name, i) => ({ tenantId, type, name, sortOrder: i }))),
    skipDuplicates: true,
  });
  return prisma.ledgerCategory.findMany({ where: { tenantId }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
}

// The id of a category by name (re-created if the operator deleted it, so automatic rows always have one)
export async function categoryId(tenantId: string, type: LedgerType, name: string): Promise<string> {
  const c = await prisma.ledgerCategory.upsert({
    where: { tenantId_type_name: { tenantId, type, name } },
    update: {},
    create: { tenantId, type, name, sortOrder: 99 },
  });
  return c.id;
}
