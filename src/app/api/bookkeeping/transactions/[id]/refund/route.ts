export const dynamic = 'force-dynamic';
// Record a refund given outside Stripe (cash, check, Zelle, Venmo…) against an income line: adds a negative "Refunds"
// line linked to the same invoice, event and client. Full or partial; refunds can't add up to more than the payment.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bookkeeper } from '@/lib/bookkeeping/auth';
import { categoryId } from '@/lib/bookkeeping/categories';
import { z } from 'zod';

const Body = z.object({
  amountCents: z.number().int().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().trim().max(60).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const payment = await prisma.ledgerTransaction.findFirst({ where: { id, tenantId: who.tenantId } });
  if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (payment.type !== 'INCOME' || payment.amountCents <= 0) return NextResponse.json({ error: 'Refunds can only be recorded against income' }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter an amount and a date' }, { status: 400 });
  const d = parsed.data;

  // Refunds already recorded against this payment (by hand, with notes linking them)
  const marker = 'refund-of:' + payment.id;
  const prior = await prisma.ledgerTransaction.aggregate({ where: { tenantId: who.tenantId, sourceKey: { startsWith: marker } }, _sum: { amountCents: true } });
  const left = payment.amountCents + (prior._sum.amountCents ?? 0);
  if (d.amountCents > left) return NextResponse.json({ error: `That's more than what's left of this payment to refund (${(left / 100).toFixed(2)})` }, { status: 400 });

  const row = await prisma.ledgerTransaction.create({
    data: {
      tenantId: who.tenantId, type: 'INCOME', date: new Date(d.date + 'T12:00:00'), amountCents: -d.amountCents,
      description: `Refund: ${payment.description}` + (d.method ? ` (${d.method})` : ''),
      payee: payment.payee, notes: d.notes || null, invoiceId: payment.invoiceId, eventId: payment.eventId, clientId: payment.clientId,
      categoryId: await categoryId(who.tenantId, 'INCOME', 'Refunds'),
      // Entered by hand (can be edited and deleted); the key ties it to the payment for the "left to refund" check
      source: 'manual', sourceKey: marker + ':' + Date.now(),
    },
  });
  return NextResponse.json(row, { status: 201 });
}
