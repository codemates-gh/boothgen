export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

const TRIGGERS = ['LEAD_CREATED', 'QUOTE_SENT', 'BOOKING_CONFIRMED', 'EVENT_DATE_MINUS_14_DAYS', 'EVENT_DATE_MINUS_7_DAYS',
  'EVENT_DATE_MINUS_1_DAY', 'EVENT_DATE_PLUS_1_DAY', 'EVENT_DATE_PLUS_3_DAYS', 'INVOICE_SENT', 'PAYMENT_RECEIVED',
  'CONTRACT_SENT', 'CONTRACT_FULLY_EXECUTED', 'GALLERY_PUBLISHED'];

// Edit a rule: only its name, trigger, template, delay and on/off; the template must be this account's
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const rule = await prisma.automationRule.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!rule) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
  if (typeof body.trigger === 'string' && TRIGGERS.includes(body.trigger)) data.trigger = body.trigger;
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive;
  if (body.triggerOffsetHours !== undefined) data.triggerOffsetHours = Number(body.triggerOffsetHours) || 0;
  if (body.emailTemplateId !== undefined) {
    if (body.emailTemplateId && !(await prisma.emailTemplate.findFirst({ where: { id: body.emailTemplateId, tenantId: session.tenantId }, select: { id: true } }))) {
      return NextResponse.json({ error: 'Template not found' }, { status: 400 });
    }
    data.emailTemplateId = body.emailTemplateId || null;
  }
  const updated = await prisma.automationRule.update({ where: { id: rule.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  await prisma.automationRule.deleteMany({ where: { id: params.id, tenantId: session.tenantId } });
  return NextResponse.json({ success: true });
}
