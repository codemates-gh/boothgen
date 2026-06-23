export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { renderToBuffer } from '@react-pdf/renderer';
import { ContractPDF } from '@/lib/pdf/contract-pdf';
import React from 'react';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireTenantSession();
  const [contract, branding] = await Promise.all([
    prisma.contract.findFirst({
      where: { id: params.id, tenantId: session.tenantId },
      include: { client: true },
    }),
    prisma.tenantBranding.findUnique({ where: { tenantId: session.tenantId } }),
  ]);
  if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const buffer = await renderToBuffer(React.createElement(ContractPDF, { contract, branding }) as any);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="contract-${contract.id.slice(0,8)}.pdf"`,
    },
  });
}
