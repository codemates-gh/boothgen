export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

// Edit or delete one of this account's email templates
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const t = await prisma.emailTemplate.findFirst({ where: { id: params.id, tenantId: session.tenantId }, select: { id: true } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { name, subject, bodyHtml } = await req.json();
  const updated = await prisma.emailTemplate.update({ where: { id: t.id }, data: { name, subject, bodyHtml } });
  return NextResponse.json(updated);
}

// Rules that used the template keep running without it ("No template"), so the page warns first
export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const t = await prisma.emailTemplate.findFirst({ where: { id: params.id, tenantId: session.tenantId }, select: { id: true } });
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.$transaction([
    prisma.automationRule.updateMany({ where: { emailTemplateId: t.id, tenantId: session.tenantId }, data: { emailTemplateId: null } }),
    prisma.emailTemplate.delete({ where: { id: t.id } }),
  ]);
  return NextResponse.json({ success: true });
}
