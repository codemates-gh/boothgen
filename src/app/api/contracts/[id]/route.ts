export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const c = await prisma.contract.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(c);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const c = await prisma.contract.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (c.status !== 'DRAFT') return NextResponse.json({ error: 'Only DRAFT contracts can be deleted.' }, { status: 400 });
  await prisma.contract.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
