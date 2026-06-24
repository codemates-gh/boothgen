export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tpl = await prisma.checklistTemplate.findFirst({ where: { id: params.id, tenantId: session.tenantId }, select: { id: true } });
  if (!tpl) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { label } = await req.json();
  if (!label?.trim()) return NextResponse.json({ error: 'Label required' }, { status: 400 });
  const count = await prisma.checklistTemplateItem.count({ where: { templateId: params.id } });
  const item = await prisma.checklistTemplateItem.create({ data: { templateId: params.id, label: label.trim(), position: count } });
  return NextResponse.json(item, { status: 201 });
}
