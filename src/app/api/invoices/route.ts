import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { clientEmail, eventId, dueDate, retainerPercent, retainerAmountCents, taxRateBps, taxAmountCents, subtotalCents, totalCents, balanceDueCents, notes, lineItems } = body;
  const client = await prisma.client.findFirst({ where: { tenantId: session.tenantId, email: clientEmail } });
  if (!client) return NextResponse.json({ error: 'Client not found: ' + clientEmail }, { status: 404 });
  const count = await prisma.invoice.count({ where: { tenantId: session.tenantId } });
  const invoiceNumber = 'INV-' + new Date().getFullYear() + '-' + String(count + 1).padStart(4, '0');
  const invoice = await prisma.invoice.create({ data: { tenantId: session.tenantId, clientId: client.id, eventId: eventId || null, invoiceNumber, status: 'DRAFT', dueDate: dueDate ? new Date(dueDate) : null, retainerPercent: retainerPercent || null, retainerAmountCents: retainerAmountCents || null, taxRateBps: taxRateBps || 0, taxAmountCents: taxAmountCents || 0, subtotalCents, totalCents, balanceDueCents, notes: notes || null, lineItems: { create: (lineItems ?? []).map((li: any, i: number) => ({ description: li.description, quantity: li.quantity, unitCents: li.unitCents, totalCents: li.totalCents, taxable: li.taxable ?? true, sortOrder: i })) } } });
  return NextResponse.json(invoice, { status: 201 });
}
