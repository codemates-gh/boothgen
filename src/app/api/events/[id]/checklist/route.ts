export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const items = await prisma.eventChecklistItem.findMany({
    where: { eventId: params.id, tenantId: session.tenantId },
    orderBy: { position: 'asc' },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId }, select: { id: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();

  // Bulk insert from template
  if (body.templateId) {
    const tpl = await prisma.checklistTemplate.findFirst({
      where: { id: body.templateId, tenantId: session.tenantId },
      include: { items: { orderBy: { position: 'asc' } } },
    });
    if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    const count = await prisma.eventChecklistItem.count({ where: { eventId: params.id } });
    await prisma.eventChecklistItem.createMany({
      data: tpl.items.map((item, i) => ({
        tenantId: session.tenantId!,
        eventId: params.id,
        label: item.label,
        position: count + i,
      })),
    });
    return NextResponse.json({ success: true }, { status: 201 });
  }

  // Single item
  const { label } = body;
  if (!label?.trim()) return NextResponse.json({ error: 'Label required' }, { status: 400 });
  const count = await prisma.eventChecklistItem.count({ where: { eventId: params.id } });
  const item = await prisma.eventChecklistItem.create({
    data: { tenantId: session.tenantId, eventId: params.id, label: label.trim(), position: count },
  });
  return NextResponse.json(item, { status: 201 });
}
