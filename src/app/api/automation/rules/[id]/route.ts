export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rule = await prisma.automationRule.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const updated = await prisma.automationRule.update({ where: { id: params.id }, data: body });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.automationRule.deleteMany({ where: { id: params.id, tenantId: session.tenantId } });
  return NextResponse.json({ success: true });
}
