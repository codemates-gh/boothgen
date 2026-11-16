export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireTenantSession();

  const invoice = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: { id: true },
  });
  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Delete children first (no cascade set in schema)
  await prisma.paymentMilestone.deleteMany({ where: { invoiceId: params.id } });
  await prisma.payment.deleteMany({ where: { invoiceId: params.id } });
  await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: params.id } });
  await prisma.invoice.delete({ where: { id: params.id } });

  return NextResponse.json({ ok: true });
}
