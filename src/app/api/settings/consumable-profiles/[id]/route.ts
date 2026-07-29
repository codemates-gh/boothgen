export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const existing = await prisma.consumableProfile.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, costPerPrintCents, isDefault, isActive } = body;

  if (isDefault) {
    await prisma.consumableProfile.updateMany({
      where: { tenantId: session.tenantId, id: { not: params.id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.consumableProfile.update({
    where: { id: params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(costPerPrintCents !== undefined && { costPerPrintCents: Math.round(costPerPrintCents) }),
      ...(isDefault !== undefined && { isDefault: Boolean(isDefault) }),
      ...(isActive !== undefined && { isActive: Boolean(isActive) }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const existing = await prisma.consumableProfile.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.consumableProfile.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
