export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const coupons = await prisma.coupon.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { quotes: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(coupons);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const { code, description, type, value, maxUses, expiresAt } = await req.json();
    if (!code?.trim()) return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    if (!value || value <= 0) return NextResponse.json({ error: 'Value must be greater than 0' }, { status: 400 });
    if (type === 'PERCENTAGE' && value > 100) return NextResponse.json({ error: 'Percentage cannot exceed 100' }, { status: 400 });

    const existing = await prisma.coupon.findUnique({ where: { tenantId_code: { tenantId: session.tenantId, code: code.trim().toUpperCase() } } });
    if (existing) return NextResponse.json({ error: 'A coupon with this code already exists' }, { status: 409 });

    const coupon = await prisma.coupon.create({
      data: {
        tenantId: session.tenantId,
        code: code.trim().toUpperCase(),
        description: description || null,
        type: type || 'PERCENTAGE',
        value: parseFloat(value),
        maxUses: maxUses ? parseInt(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    return NextResponse.json(coupon, { status: 201 });
  } catch (err) {
    console.error('[coupons POST]', err);
    return NextResponse.json({ error: 'Failed to create coupon. Please try again.' }, { status: 500 });
  }
}
