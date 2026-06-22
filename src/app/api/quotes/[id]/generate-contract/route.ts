export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const quote = await prisma.quote.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: {
      event: { include: { invoices: { take: 1, orderBy: { createdAt: 'desc' } }, contracts: { take: 1 } } },
      client: true,
      contractTemplate: true,
      tenant: { include: { branding: true, contractTemplates: { where: { isDefault: true }, take: 1 } } },
    },
  });
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (quote.status !== 'ACCEPTED') return NextResponse.json({ error: 'Quote must be accepted first' }, { status: 400 });
  if (quote.event.contracts.length > 0) return NextResponse.json({ error: 'Contract already exists for this event' }, { status: 400 });

  const template = quote.contractTemplate ?? quote.tenant.contractTemplates[0] ?? null;
  const ctx = buildCtx({
    client: quote.client,
    event: quote.event,
    invoice: quote.event.invoices[0] ?? null,
    branding: quote.tenant.branding ?? {},
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
  });
  const templateContent = template?.bodyHtml ?? '<p>Services Agreement between {{host.company_name}} and {{client.full_name}}.</p>';
  const renderedContent = parseMergeTags(templateContent, ctx);

  const contract = await prisma.contract.create({
    data: {
      tenantId: quote.tenantId, eventId: quote.eventId, clientId: quote.clientId,
      templateId: template?.id ?? null,
      title: 'Services Agreement — ' + quote.event.title,
      templateContent,
      renderedContent,
      status: 'DRAFT',
    },
  });
  return NextResponse.json(contract, { status: 201 });
}
