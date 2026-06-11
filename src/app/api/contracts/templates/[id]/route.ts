export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, bodyHtml } = await req.json();
  const t = await prisma.contractTemplate.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.contractTemplate.update({ where: { id: params.id }, data: { name, bodyHtml } });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const t = await prisma.contractTemplate.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.contractTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
