export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const rules = await prisma.automationRule.findMany({ where: { tenantId: session.tenantId }, include: { emailTemplate: { select: { id: true, name: true, subject: true } } }, orderBy: [{ trigger: 'asc' }, { sortOrder: 'asc' }] });
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name, trigger, emailTemplateId, actionType, triggerOffsetHours } = await req.json();
  if (!name || !trigger) return NextResponse.json({ error: 'Name and trigger required' }, { status: 400 });
  const rule = await prisma.automationRule.create({ data: { tenantId: session.tenantId, name, trigger, actionType: actionType || 'EMAIL', emailTemplateId: emailTemplateId || null, triggerOffsetHours: triggerOffsetHours || 0, isActive: true } });
  return NextResponse.json(rule, { status: 201 });
}
