export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { label } = await req.json();
  const item = await prisma.checklistTemplateItem.findFirst({
    where: { id: params.itemId, template: { id: params.id, tenantId: session.tenantId } },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const updated = await prisma.checklistTemplateItem.update({ where: { id: params.itemId }, data: { label: label.trim() } });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const item = await prisma.checklistTemplateItem.findFirst({
    where: { id: params.itemId, template: { id: params.id, tenantId: session.tenantId } },
  });
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.checklistTemplateItem.delete({ where: { id: params.itemId } });
  return NextResponse.json({ success: true });
}
