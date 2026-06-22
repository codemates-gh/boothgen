export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

const EDITABLE = ['DRAFT', 'SENT', 'VIEWED', 'DECLINED', 'EXPIRED'];

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const quote = await prisma.quote.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } }, contractTemplate: { select: { id: true, name: true } } },
  });
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(quote);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = await prisma.quote.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!EDITABLE.includes(q.status)) return NextResponse.json({ error: 'Accepted quotes cannot be edited' }, { status: 400 });
  const body = await req.json();
  const { lineItems, notes, terms, taxRatePercent, validUntil, discountCents, contractTemplateId, paymentType, depositPercent } = body;
  const items = lineItems || [];
  const subtotal = items.reduce((s: number, i: any) => s + (i.totalCents || 0), 0);
  const tax = Math.round(subtotal * ((taxRatePercent || 0) / 100));
  const discount = discountCents || 0;
  const total = subtotal + tax - discount;
  await prisma.quoteLineItem.deleteMany({ where: { quoteId: params.id } });
  const updated = await prisma.quote.update({
    where: { id: params.id },
    data: {
      notes: notes || null, terms: terms || null, taxRatePercent: taxRatePercent || 0,
      taxAmountCents: tax, subtotalCents: subtotal, discountCents: discount, totalCents: total,
      validUntil: validUntil ? new Date(validUntil) : null,
      contractTemplateId: contractTemplateId !== undefined ? (contractTemplateId || null) : undefined,
      paymentType: paymentType || undefined,
      depositPercent: depositPercent ?? undefined,
      // Reset to DRAFT when editing a sent quote so it can be re-sent
      status: q.status !== 'DRAFT' ? 'DRAFT' : undefined,
      sentAt: q.status !== 'DRAFT' ? null : undefined,
      lineItems: { create: items.map((li: any, i: number) => ({ description: li.description, quantity: li.quantity || 1, unitCents: li.unitCents || 0, totalCents: li.totalCents || 0, sortOrder: i })) },
    },
    include: { lineItems: true, contractTemplate: { select: { id: true, name: true } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const q = await prisma.quote.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!EDITABLE.includes(q.status)) return NextResponse.json({ error: 'Accepted quotes cannot be deleted' }, { status: 400 });
  await prisma.quote.deleteMany({ where: { id: params.id, tenantId: session.tenantId } });
  return NextResponse.json({ success: true });
}
