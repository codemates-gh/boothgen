export const dynamic = 'force-dynamic';
// Bookkeeping categories: list (with how many transactions use each) and add
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bookkeeper } from '@/lib/bookkeeping/auth';
import { ensureCategories } from '@/lib/bookkeeping/categories';
import { z } from 'zod';

export async function GET() {
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  await ensureCategories(who.tenantId);
  const cats = await prisma.ledgerCategory.findMany({
    where: { tenantId: who.tenantId }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { transactions: true } } },
  });
  return NextResponse.json(cats);
}

const Create = z.object({ name: z.string().trim().min(1).max(60), type: z.enum(['INCOME', 'EXPENSE']) });

export async function POST(req: NextRequest) {
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a name' }, { status: 400 });
  const exists = await prisma.ledgerCategory.findFirst({ where: { tenantId: who.tenantId, type: parsed.data.type, name: { equals: parsed.data.name, mode: 'insensitive' } } });
  if (exists) return NextResponse.json({ error: 'That category already exists' }, { status: 409 });
  const cat = await prisma.ledgerCategory.create({ data: { tenantId: who.tenantId, ...parsed.data, sortOrder: 50 } });
  return NextResponse.json(cat, { status: 201 });
}
