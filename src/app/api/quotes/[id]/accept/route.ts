export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const { signatureData, clientName, portalToken } = await req.json();
  const quote = await prisma.quote.findFirst({
    where: { id: params.id },
    include: {
      event: { include: { invoices: { take: 1, orderBy: { createdAt: 'desc' } } } },
      client: true,
      contractTemplate: true,
      tenant: { include: { branding: true, contractTemplates: { where: { isDefault: true }, take: 1 } } },
    },
  });
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (quote.event.portalToken !== portalToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (quote.status !== 'SENT' && quote.status !== 'VIEWED') return NextResponse.json({ error: 'Quote cannot be accepted' }, { status: 400 });

  const now = new Date();
  const template = quote.contractTemplate ?? quote.tenant.contractTemplates[0] ?? null;

  // Build rendered contract body using the full merge-tag system
  let renderedContent = '<p>Thank you for accepting this quote.</p>';
  let templateContent = renderedContent;
  if (template) {
    const ctx = buildCtx({
      client: quote.client,
      event: quote.event,
      invoice: quote.event.invoices[0] ?? null,
      branding: quote.tenant.branding ?? {},
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
    });
    templateContent = template.bodyHtml;
    renderedContent = parseMergeTags(template.bodyHtml, ctx);
  }

  // Use a transaction so quote acceptance and contract creation succeed or fail together
  await prisma.$transaction(async (tx) => {
    await tx.quote.update({
      where: { id: params.id },
      data: { status: 'ACCEPTED', acceptedAt: now, clientSignatureData: signatureData, clientSignedAt: now, clientIpAddress: ip, clientName },
    });
    await tx.event.update({ where: { id: quote.eventId }, data: { status: 'BOOKED' } });
    await tx.contract.create({
      data: {
        tenantId: quote.tenantId, eventId: quote.eventId, clientId: quote.clientId,
        templateId: template?.id ?? null,
        title: 'Services Agreement — ' + quote.event.title,
        templateContent,
        renderedContent,
        status: 'DRAFT',
      },
    });
  });

  return NextResponse.json({ success: true });
}
