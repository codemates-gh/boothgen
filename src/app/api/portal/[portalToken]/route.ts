export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function GET(_: NextRequest, { params }: { params: { portalToken: string } }) {
  const event = await prisma.event.findFirst({
    where: { portalToken: params.portalToken },
    include: {
      client: true,
      tenant: { include: { branding: { select: { companyName: true, logoUrl: true, primaryColor: true, replyToEmail: true } } } },
      invoices: { include: { lineItems: { orderBy: { sortOrder: 'asc' } }, PaymentMilestone: { orderBy: { dueDate: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 1 },
      contracts: { orderBy: { createdAt: 'desc' }, take: 1 },
      Quote: { include: { lineItems: { orderBy: { sortOrder: 'asc' } } }, orderBy: { createdAt: 'desc' }, take: 1 },
      gallery: { include: { assets: { where: { approvalStatus: 'APPROVED' }, orderBy: { createdAt: 'asc' } } } },
      templateDesigns: { orderBy: { version: 'desc' } },
    },
  });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Mark quote as viewed
  if (event.Quote[0]?.status === 'SENT') {
    await prisma.quote.update({ where: { id: event.Quote[0].id }, data: { status: 'VIEWED', viewedAt: new Date() } });
  }

  // Normalize invoice: rename PaymentMilestone → milestones for frontend
  const rawInvoice = event.invoices[0] || null;
  const invoice = rawInvoice
    ? { ...rawInvoice, milestones: (rawInvoice as any).PaymentMilestone ?? [], PaymentMilestone: undefined }
    : null;

  return NextResponse.json({
    event: { ...event, Quote: undefined, invoices: undefined, contracts: undefined, gallery: undefined, templateDesigns: undefined },
    client: event.client,
    tenant: event.tenant,
    quote: event.Quote[0] || null,
    contract: event.contracts[0] || null,
    invoice,
    gallery: event.gallery ? { ...event.gallery, assets: undefined } : null,
    assets: event.gallery?.assets || [],
    templateDesigns: event.templateDesigns || [],
  });
}
