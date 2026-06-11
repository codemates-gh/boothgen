export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function GET(_: NextRequest, { params }: { params: { portalToken: string } }) {
  const event = await prisma.event.findFirst({
    where: { portalToken: params.portalToken },
    include: {
      client: true,
      tenant: { include: { branding: { select: { companyName: true, logoUrl: true, primaryColor: true, replyToEmail: true } } } },
      invoices: { include: { lineItems: { orderBy: { sortOrder: 'asc' } }, milestones: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      contracts: { orderBy: { createdAt: 'desc' }, take: 1 },
      quotes: { include: { lineItems: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 1 },
      gallery: { include: { assets: { where: { approvalStatus: 'APPROVED' }, orderBy: { createdAt: 'asc' } } } },
    },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Mark quote as viewed
  if (event.quotes[0]?.status === 'SENT') {
    await prisma.quote.update({ where: { id: event.quotes[0].id }, data: { status: 'VIEWED', viewedAt: new Date() } });
  }

  return NextResponse.json({
    event: { ...event, quotes: undefined, invoices: undefined, contracts: undefined, gallery: undefined },
    client: event.client,
    tenant: event.tenant,
    quote: event.quotes[0] || null,
    contract: event.contracts[0] || null,
    invoice: event.invoices[0] || null,
    gallery: event.gallery ? { ...event.gallery, assets: undefined } : null,
    assets: event.gallery?.assets || [],
  });
}
