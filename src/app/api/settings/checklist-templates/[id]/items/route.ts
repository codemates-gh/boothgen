export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { isCompleteOrder } from '@/lib/checklists/reorder';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tpl = await prisma.checklistTemplate.findFirst({ where: { id: params.id, tenantId: session.tenantId }, select: { id: true } });
  if (!tpl) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { label } = await req.json().catch(() => ({}));
  if (typeof label !== 'string' || !label.trim()) return NextResponse.json({ error: 'Label required' }, { status: 400 });
  const count = await prisma.checklistTemplateItem.count({ where: { templateId: params.id } });
  const item = await prisma.checklistTemplateItem.create({ data: { templateId: params.id, label: label.trim(), position: count } });
  return NextResponse.json(item, { status: 201 });
}

/** Reorders a template's items. Body: { order: [itemId, …] } naming every item once, top first. */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tpl = await prisma.checklistTemplate.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: { items: { select: { id: true } } },
  });
  if (!tpl) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { order } = await req.json().catch(() => ({}));
  if (!isCompleteOrder(order, tpl.items.map(i => i.id))) {
    return NextResponse.json({ error: 'Order must list every item once' }, { status: 400 });
  }
  await prisma.$transaction(order.map((id, position) =>
    prisma.checklistTemplateItem.update({ where: { id }, data: { position } })));
  return NextResponse.json({ success: true });
}
