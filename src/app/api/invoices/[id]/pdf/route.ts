export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { renderToBuffer } from '@react-pdf/renderer';
import { InvoicePDF } from '@/lib/pdf/invoice-pdf';
import React from 'react';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const [inv, branding] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id: params.id, tenantId: session.tenantId },
      include: { client: true, event: true, lineItems: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.tenantBranding.findUnique({ where: { tenantId: session.tenantId } }),
  ]);
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const buffer = await renderToBuffer(React.createElement(InvoicePDF, { inv, branding }) as any);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${inv.invoiceNumber}.pdf"`,
    },
  });
}
