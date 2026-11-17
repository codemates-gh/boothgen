export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { buildCtx, parseMergeTags } from '@/lib/contracts/merge-tags';
export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const c = await prisma.contract.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: {
      client: true,
      event: {
        include: {
          invoices: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            include: { PaymentMilestone: { where: { status: { not: 'PAID' } }, orderBy: { dueDate: 'asc' }, take: 1 } },
          },
        },
      },
    },
  });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Re-render merge tags live so the admin always sees up-to-date invoice/event data
  if (c.templateContent && c.event) {
    const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { branding: true } });
    const invoice = c.event.invoices[0] ?? null;
    const firstMilestoneDueDate = invoice?.PaymentMilestone?.[0]?.dueDate ?? null;
    const ctx = buildCtx({
      client: c.client,
      event: c.event,
      invoice: invoice ? { ...invoice, firstMilestoneDueDate } : null,
      contract: { clientToken: c.clientToken, title: c.title, expiresAt: c.expiresAt },
      branding: tenant?.branding ?? {},
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
    });
    return NextResponse.json({ ...c, renderedContent: parseMergeTags(c.templateContent, ctx) });
  }

  return NextResponse.json(c);
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const c = await prisma.contract.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { event: { include: { client: true, invoices: { take: 1, orderBy: { createdAt: 'desc' }, include: { PaymentMilestone: { where: { status: { not: 'PAID' } }, orderBy: { dueDate: 'asc' }, take: 1 } } } } } },
  });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (c.status !== 'DRAFT') return NextResponse.json({ error: 'Only DRAFT contracts can be edited.' }, { status: 400 });
  const { title, renderedContent: rawContent } = await req.json();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { branding: true } });
  let resolved = rawContent;
  if (rawContent && c.event) {
    const inv = c.event.invoices[0] ?? null;
    const ctx = buildCtx({ client: c.event.client, event: c.event, invoice: inv ? { ...inv, firstMilestoneDueDate: inv.PaymentMilestone?.[0]?.dueDate ?? null } : null, contract: { clientToken: c.clientToken, title: title ?? c.title, expiresAt: c.expiresAt }, branding: tenant?.branding ?? {}, appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '' });
    resolved = parseMergeTags(rawContent, ctx);
  }
  const updated = await prisma.contract.update({
    where: { id: params.id },
    data: { ...(title ? { title } : {}), ...(rawContent ? { templateContent: rawContent, renderedContent: resolved } : {}) },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const c = await prisma.contract.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const unsignedStatuses = ['DRAFT', 'SENT_TO_CLIENT'];
  if (!unsignedStatuses.includes(c.status)) {
    return NextResponse.json({ error: 'Signed contracts cannot be deleted. Use Void instead.' }, { status: 400 });
  }
  await prisma.contract.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
