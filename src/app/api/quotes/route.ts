export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const quotes = await prisma.quote.findMany({
    where: { tenantId: session.tenantId, event: { status: { notIn: ['COMPLETED', 'LOST'] } } },
    include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(quotes);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { eventId, lineItems, notes, terms, taxRatePercent, validUntil, discountCents, discountLabel, couponId, contractTemplateId, paymentType, depositPercent } = body;
  if (!eventId) return NextResponse.json({ error: 'Event required' }, { status: 400 });
  const event = await prisma.event.findFirst({ where: { id: eventId, tenantId: session.tenantId }, include: { client: true } });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Validate coupon if provided
  let resolvedCouponId: string | null = couponId || null;
  if (resolvedCouponId) {
    const coupon = await prisma.coupon.findFirst({ where: { id: resolvedCouponId, tenantId: session.tenantId, isActive: true } });
    if (!coupon) return NextResponse.json({ error: 'Invalid or inactive coupon' }, { status: 400 });
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return NextResponse.json({ error: 'Coupon has reached its maximum uses' }, { status: 400 });
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return NextResponse.json({ error: 'Coupon has expired' }, { status: 400 });
  }

  const count = await prisma.quote.count({ where: { tenantId: session.tenantId } });
  const quoteNumber = 'Q-' + String(count + 1).padStart(4, '0');
  const items = lineItems || [];
  const subtotal = items.reduce((s: number, i: any) => s + (i.totalCents || 0), 0);
  const tax = Math.round(subtotal * ((taxRatePercent || 0) / 100));
  const discount = discountCents || 0;
  const total = subtotal + tax - discount;

  const quote = await prisma.quote.create({
    data: {
      tenantId: session.tenantId, eventId, clientId: event.clientId,
      quoteNumber, notes: notes || null, terms: terms || null,
      taxRatePercent: taxRatePercent || 0, taxAmountCents: tax,
      subtotalCents: subtotal, discountCents: discount, discountLabel: discountLabel || null,
      couponId: resolvedCouponId, totalCents: total,
      validUntil: validUntil ? new Date(validUntil) : null,
      contractTemplateId: contractTemplateId || null,
      paymentType: paymentType || 'full',
      depositPercent: depositPercent ?? 50,
      lineItems: { create: items.map((li: any, i: number) => ({ description: li.description, quantity: li.quantity || 1, unitCents: li.unitCents || 0, totalCents: li.totalCents || 0, sortOrder: i })) },
    },
    include: { lineItems: true },
  });

  // Increment coupon usage count
  if (resolvedCouponId) {
    await prisma.coupon.update({ where: { id: resolvedCouponId }, data: { usedCount: { increment: 1 } } });
  }

  return NextResponse.json(quote, { status: 201 });
}
