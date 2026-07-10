export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const pkg = await prisma.servicePackage.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { name, description, priceCents, corporatePriceCents, category, isActive, sortOrder } = body;
  const updated = await prisma.servicePackage.update({ where: { id: params.id }, data: { name, description, priceCents, corporatePriceCents: corporatePriceCents ?? null, category, isActive, sortOrder } });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const pkg = await prisma.servicePackage.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.servicePackage.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
