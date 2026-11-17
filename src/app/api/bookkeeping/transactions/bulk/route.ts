export const dynamic = 'force-dynamic';
// Actions on selected transactions: Categorize, Verify / Unverify, Delete (hand-entered only), Assign to Event
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bookkeeper } from '@/lib/bookkeeping/auth';
import { categorizeSamePayee } from '@/lib/bookkeeping/payees';
import { z } from 'zod';

const Bulk = z.object({
  ids: z.array(z.string()).min(1).max(1000),
  action: z.enum(['categorize', 'verify', 'unverify', 'delete', 'assign']),
  categoryId: z.string().nullable().optional(),
  eventId: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const parsed = Bulk.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { ids, action, categoryId, eventId } = parsed.data;
  const where = { id: { in: ids }, tenantId: who.tenantId };

  if (action === 'verify' || action === 'unverify') {
    const r = await prisma.ledgerTransaction.updateMany({ where, data: { verified: action === 'verify' } });
    return NextResponse.json({ count: r.count });
  }
  if (action === 'delete') {
    const r = await prisma.ledgerTransaction.deleteMany({ where: { ...where, source: 'manual' } });
    return NextResponse.json({ count: r.count, skipped: ids.length - r.count });
  }
  if (action === 'categorize') {
    if (!categoryId) {
      const r = await prisma.ledgerTransaction.updateMany({ where, data: { categoryId: null } });
      return NextResponse.json({ count: r.count });
    }
    const cat = await prisma.ledgerCategory.findFirst({ where: { id: categoryId, tenantId: who.tenantId } });
    if (!cat) return NextResponse.json({ error: 'Category not found' }, { status: 400 });
    // Only rows of the category's kind (income categories on income, expense on expenses)
    const r = await prisma.ledgerTransaction.updateMany({ where: { ...where, type: cat.type }, data: { categoryId } });
    const alsoCategorized = await categorizeSamePayee(who.tenantId, ids, categoryId);
    return NextResponse.json({ count: r.count, skipped: ids.length - r.count, alsoCategorized });
  }
  // assign to event (or clear)
  if (eventId) {
    const ev = await prisma.event.findFirst({ where: { id: eventId, tenantId: who.tenantId }, select: { id: true, clientId: true } });
    if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 400 });
    const r1 = await prisma.ledgerTransaction.updateMany({ where: { ...where, invoiceId: null }, data: { eventId, clientId: ev.clientId } });
    const r2 = await prisma.ledgerTransaction.updateMany({ where: { ...where, invoiceId: { not: null } }, data: { eventId } });
    return NextResponse.json({ count: r1.count + r2.count });
  }
  const r = await prisma.ledgerTransaction.updateMany({ where: { ...where, invoiceId: null }, data: { eventId: null, clientId: null } });
  return NextResponse.json({ count: r.count });
}
