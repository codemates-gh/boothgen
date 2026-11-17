export const dynamic = 'force-dynamic';
// One transaction: edit (PATCH) or delete (DELETE). Rows BoothGen filled in from payments keep their amount, date and
// description; their category, notes, event, receipt and verified mark can change. Only hand-entered rows can be deleted.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bookkeeper, receiptPrefix } from '@/lib/bookkeeping/auth';
import { categorizeSamePayee } from '@/lib/bookkeeping/payees';
import { z } from 'zod';

const Patch = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  amountCents: z.number().int().min(1).max(100_000_000).optional(),
  description: z.string().trim().min(1).max(300).optional(),
  payee: z.string().trim().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  eventId: z.string().nullable().optional(),
  receiptUrl: z.string().url().nullable().optional(),
  receiptName: z.string().max(300).nullable().optional(),
  verified: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const row = await prisma.ledgerTransaction.findFirst({ where: { id, tenantId: who.tenantId } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  const d = parsed.data;
  const auto = row.source !== 'manual';
  if (auto && (d.date !== undefined || d.amountCents !== undefined || d.description !== undefined || d.payee !== undefined)) {
    return NextResponse.json({ error: 'BoothGen filled this in: change it where it came from (the invoice, Print Log or the event\'s Profitability card)' }, { status: 400 });
  }
  if (d.categoryId && !(await prisma.ledgerCategory.findFirst({ where: { id: d.categoryId, tenantId: who.tenantId, type: row.type } }))) {
    return NextResponse.json({ error: 'Pick a category of the right kind' }, { status: 400 });
  }
  let clientId: string | null | undefined;
  if (d.eventId !== undefined) {
    if (d.eventId) {
      const ev = await prisma.event.findFirst({ where: { id: d.eventId, tenantId: who.tenantId }, select: { clientId: true } });
      if (!ev) return NextResponse.json({ error: 'Event not found' }, { status: 400 });
      clientId = row.invoiceId ? undefined : ev.clientId;
    } else if (!row.invoiceId) clientId = null;
  }
  if (d.receiptUrl && !d.receiptUrl.startsWith(receiptPrefix(who.tenantId))) return NextResponse.json({ error: 'Invalid receipt' }, { status: 400 });
  const updated = await prisma.ledgerTransaction.update({
    where: { id },
    data: {
      ...(d.date ? { date: new Date(d.date + 'T12:00:00') } : {}),
      ...(d.amountCents !== undefined ? { amountCents: row.amountCents < 0 ? -d.amountCents : d.amountCents } : {}), // refunds stay negative
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.payee !== undefined ? { payee: d.payee || null } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
      ...(d.categoryId !== undefined ? { categoryId: d.categoryId || null } : {}),
      ...(d.eventId !== undefined ? { eventId: d.eventId || null } : {}),
      ...(clientId !== undefined ? { clientId } : {}),
      ...(d.receiptUrl !== undefined ? { receiptUrl: d.receiptUrl || null, receiptName: d.receiptUrl ? d.receiptName ?? null : null } : {}),
      ...(d.verified !== undefined ? { verified: d.verified } : {}),
    },
  });
  // Categorized: other uncategorized transactions from the same payee get the same category
  const alsoCategorized = d.categoryId && d.categoryId !== row.categoryId ? await categorizeSamePayee(who.tenantId, [id], d.categoryId) : 0;
  return NextResponse.json({ ...updated, alsoCategorized });
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const row = await prisma.ledgerTransaction.findFirst({ where: { id, tenantId: who.tenantId } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (row.source !== 'manual') return NextResponse.json({ error: 'BoothGen filled this in. Change it where it came from (the invoice, Print Log or the event\'s Profitability card).' }, { status: 400 });
  await prisma.ledgerTransaction.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
