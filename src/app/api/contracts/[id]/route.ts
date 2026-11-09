export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { buildCtx, parseMergeTags } from '@/lib/contracts/merge-tags';
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const c = await prisma.contract.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(c);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const c = await prisma.contract.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { event: { include: { client: true, invoices: { take: 1, orderBy: { createdAt: 'desc' } } } } },
  });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (c.status !== 'DRAFT') return NextResponse.json({ error: 'Only DRAFT contracts can be edited.' }, { status: 400 });
  const { title, renderedContent: rawContent } = await req.json();
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { branding: true } });
  let resolved = rawContent;
  if (rawContent && c.event) {
    const ctx = buildCtx({ client: c.event.client, event: c.event, invoice: c.event.invoices[0] ?? null, contract: { clientToken: c.clientToken, title: title ?? c.title, expiresAt: c.expiresAt }, branding: tenant?.branding ?? {}, appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '' });
    resolved = parseMergeTags(rawContent, ctx);
  }
  const updated = await prisma.contract.update({
    where: { id: params.id },
    data: { ...(title ? { title } : {}), ...(rawContent ? { templateContent: rawContent, renderedContent: resolved } : {}) },
  });
  return NextResponse.json(updated);
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
