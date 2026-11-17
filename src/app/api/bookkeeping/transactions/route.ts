export const dynamic = 'force-dynamic';
// Bookkeeping transactions: list with filters and tab counts (GET), add income or an expense by hand (POST)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bookkeeper, receiptPrefix } from '@/lib/bookkeeping/auth';
import { ensureCategories } from '@/lib/bookkeeping/categories';
import { ledgerWhere, filtersFrom } from '@/lib/bookkeeping/query';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const f = filtersFrom(req.nextUrl.searchParams);
  const where = ledgerWhere(who.tenantId, f);
  const base = { tenantId: who.tenantId, amountCents: { not: 0 } };
  const [rows, totals, uncategorized, categories, events] = await Promise.all([
    prisma.ledgerTransaction.findMany({
      where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 1000,
      include: { category: { select: { id: true, name: true } }, event: { select: { id: true, title: true } }, invoice: { select: { id: true, invoiceNumber: true } } },
    }),
    prisma.ledgerTransaction.groupBy({ by: ['type'], where, _sum: { amountCents: true } }),
    prisma.ledgerTransaction.count({ where: { ...base, categoryId: null } }),
    ensureCategories(who.tenantId),
    prisma.event.findMany({ where: { tenantId: who.tenantId }, select: { id: true, title: true, eventDate: true }, orderBy: { eventDate: 'desc' }, take: 300 }),
  ]);
  const sum = (t: string) => totals.find(x => x.type === t)?._sum.amountCents ?? 0;
  return NextResponse.json({ rows, income: sum('INCOME'), expense: sum('EXPENSE'), uncategorized, categories, events });
}

const Create = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountCents: z.number().int().min(1).max(100_000_000),
  description: z.string().trim().min(1).max(300),
  payee: z.string().trim().max(200).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  eventId: z.string().optional().nullable(),
  receiptUrl: z.string().url().optional().nullable(),
  receiptName: z.string().max(300).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const parsed = Create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  const d = parsed.data;
  if (d.categoryId && !(await prisma.ledgerCategory.findFirst({ where: { id: d.categoryId, tenantId: who.tenantId, type: d.type } }))) {
    return NextResponse.json({ error: 'Pick a category of the right kind' }, { status: 400 });
  }
  let clientId: string | null = null;
  if (d.eventId) {
    const ev = await prisma.event.findFirst({ where: { id: d.eventId, tenantId: who.tenantId }, select: { clientId: true } });
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 400 });
    clientId = ev.clientId;
  }
  if (d.receiptUrl && !d.receiptUrl.startsWith(receiptPrefix(who.tenantId))) return NextResponse.json({ error: 'Invalid receipt' }, { status: 400 });
  const row = await prisma.ledgerTransaction.create({
    data: {
      tenantId: who.tenantId, type: d.type, date: new Date(d.date + 'T12:00:00'), amountCents: d.amountCents, description: d.description,
      payee: d.payee || null, notes: d.notes || null, categoryId: d.categoryId || null, eventId: d.eventId || null, clientId,
      receiptUrl: d.receiptUrl || null, receiptName: d.receiptName || null, source: 'manual',
    },
  });
  return NextResponse.json(row, { status: 201 });
}
