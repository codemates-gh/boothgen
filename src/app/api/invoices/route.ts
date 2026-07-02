export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const invoices = await prisma.invoice.findMany({
    where: { tenantId: session.tenantId, OR: [{ eventId: null }, { event: { status: { notIn: ['COMPLETED', 'LOST'] } } }] },
    include: { client: true, event: true, PaymentMilestone: { orderBy: { dueDate: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(invoices);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { eventId, lineItems, taxRatePercent, dueDate, depositDueDate, balanceDueDate, notes, paymentType, depositPercent } = body;
  if (!eventId) return NextResponse.json({ error: 'Event required' }, { status: 400 });
  const event = await prisma.event.findFirst({ where: { id: eventId, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  const count = await prisma.invoice.count({ where: { tenantId: session.tenantId } });
  const invoiceNumber = 'INV-' + String(count + 1).padStart(4, '0');
  const items = lineItems || [];
  const subtotal = items.reduce((s: number, i: any) => s + (i.totalCents || 0), 0);
  const tax = Math.round(subtotal * ((taxRatePercent || 0) / 100));
  const total = subtotal + tax;
  const depositAmt = paymentType === 'deposit' ? Math.round(total * ((depositPercent||50)/100)) : total;

  // For full payment, use dueDate; for deposit, each milestone has its own due date
  // Store as UTC noon so the same calendar date renders correctly in all US timezones
  const toUTCNoon = (s?: string): Date | null => s ? new Date(s + 'T12:00:00.000Z') : null;
  const fullDueDate = toUTCNoon(dueDate);
  const depositMilestoneDue = toUTCNoon(depositDueDate) ?? fullDueDate ?? new Date();
  const balanceMilestoneDue = toUTCNoon(balanceDueDate) ?? fullDueDate ?? new Date();

  const invoice = await prisma.invoice.create({
    data: {
      tenantId: session.tenantId, eventId, clientId: event.clientId,
      invoiceNumber, subtotalCents: subtotal, taxAmountCents: tax, totalCents: total,
      balanceDueCents: total, amountPaidCents: 0,
      dueDate: fullDueDate,
      notes: notes || null, status: 'DRAFT',
      lineItems: { create: items.map((li: any, i: number) => ({ description: li.description, quantity: li.quantity||1, unitCents: li.unitCents||0, totalCents: li.totalCents||0, sortOrder: i })) },
      ...(paymentType === 'deposit' ? {
        PaymentMilestone: { create: [
          { tenantId: session.tenantId, label: 'Deposit', amountCents: depositAmt, dueDate: depositMilestoneDue },
          { tenantId: session.tenantId, label: 'Balance', amountCents: total - depositAmt, dueDate: balanceMilestoneDue },
        ]},
      } : {}),
    },
    include: { lineItems: true, PaymentMilestone: true },
  });
  return NextResponse.json(invoice, { status: 201 });
}
