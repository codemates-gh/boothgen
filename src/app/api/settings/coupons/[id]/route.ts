export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const coupon = await prisma.coupon.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!coupon) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.coupon.update({
    where: { id: params.id },
    data: {
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.description !== undefined && { description: body.description || null }),
      ...(body.maxUses !== undefined && { maxUses: body.maxUses ? parseInt(body.maxUses) : null }),
      ...(body.expiresAt !== undefined && { expiresAt: body.expiresAt ? new Date(body.expiresAt) : null }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const coupon = await prisma.coupon.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!coupon) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (coupon.usedCount > 0) return NextResponse.json({ error: 'Cannot delete a coupon that has been used. Deactivate it instead.' }, { status: 400 });
  await prisma.coupon.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
