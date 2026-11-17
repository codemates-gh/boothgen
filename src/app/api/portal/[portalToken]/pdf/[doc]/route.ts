export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { renderToBuffer } from '@react-pdf/renderer';
import { QuotePDF } from '@/lib/pdf/quote-pdf';
import { InvoicePDF } from '@/lib/pdf/invoice-pdf';
import { ContractPDF } from '@/lib/pdf/contract-pdf';
import { closedForClients } from '@/lib/genius';
import React from 'react';

// Client portal "Download PDF" (report #9): the same quote, invoice or contract the portal shows (the event's latest),
// found through the portal link, so clients don't need to sign in
const DOCS = ['quote', 'invoice', 'contract'] as const;
type Doc = typeof DOCS[number];

const pdfResponse = (buffer: Buffer, filename: string) => new NextResponse(new Uint8Array(buffer), {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename.replace(/[^\w.-]+/g, '-')}.pdf"`,
    'Cache-Control': 'private, no-store',
  },
});

export async function GET(
  _: NextRequest,
  props: { params: Promise<{ portalToken: string; doc: string }> }
) {
  const params = await props.params;
  if (!DOCS.includes(params.doc as Doc)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const doc = params.doc as Doc;

  const event = await prisma.event.findFirst({ where: { portalToken: params.portalToken }, select: { id: true, tenantId: true } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  { const closed = await closedForClients(event.tenantId); if (closed) return closed; } // Genie-only account: CRM is closed

  const branding = await prisma.tenantBranding.findUnique({ where: { tenantId: event.tenantId } });
  const latest = { orderBy: { createdAt: 'desc' as const } };

  if (doc === 'quote') {
    const quote = await prisma.quote.findFirst({
      where: { eventId: event.id }, ...latest,
      include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return pdfResponse(await renderToBuffer(React.createElement(QuotePDF, { quote, branding }) as any), quote.quoteNumber);
  }

  if (doc === 'invoice') {
    const inv = await prisma.invoice.findFirst({
      where: { eventId: event.id }, ...latest,
      include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return pdfResponse(await renderToBuffer(React.createElement(InvoicePDF, { inv, branding }) as any), inv.invoiceNumber);
  }

  const contract = await prisma.contract.findFirst({ where: { eventId: event.id }, ...latest, include: { client: true } });
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return pdfResponse(await renderToBuffer(React.createElement(ContractPDF, { contract, branding }) as any), 'contract-' + contract.id.slice(0, 8));
}
