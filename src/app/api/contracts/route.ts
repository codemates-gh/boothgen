export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { branding: true } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { title, eventId, templateId } = await req.json();
  let template = templateId ? await prisma.contractTemplate.findFirst({ where: { id: templateId, tenantId: tenant.id } }) : await prisma.contractTemplate.findFirst({ where: { tenantId: tenant.id, isDefault: true } });
  if (!template) template = await prisma.contractTemplate.findFirst({ where: { tenantId: tenant.id } });
  const templateContent = template?.bodyHtml ?? '<p>Agreement between {{host.company_name}} and {{client.full_name}}.</p>';
  let clientId: string | null = null; let renderedContent = templateContent;
  if (eventId) {
    const event = await prisma.event.findFirst({ where: { id: eventId, tenantId: tenant.id }, include: { client: true, invoices: { take: 1, orderBy: { createdAt: 'desc' } } } });
    if (event) { clientId = event.clientId; const ctx = buildCtx({ client: event.client, event, invoice: event.invoices[0] ?? null, contract: null, branding: tenant.branding ?? {}, appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '' }); renderedContent = parseMergeTags(templateContent, ctx); }
  }
  if (!clientId) { const latestEvent = await prisma.event.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' } }); if (!latestEvent) return NextResponse.json({ error: 'No clients found. Create an event first.' }, { status: 400 }); clientId = latestEvent.clientId; }
  const contract = await prisma.contract.create({ data: { tenantId: tenant.id, clientId, eventId: eventId ?? null, templateId: template?.id ?? null, title: title ?? 'Service Agreement', status: 'DRAFT', templateContent, renderedContent } });
  return NextResponse.json(contract, { status: 201 });
}
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const contracts = await prisma.contract.findMany({ where: { tenantId: session.tenantId }, include: { client: true, event: true }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json(contracts);
}
