export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const quote = await prisma.quote.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: {
      event: { include: { invoices: { take: 1, orderBy: { createdAt: 'desc' } } } },
      client: true,
      contractTemplate: true,
      tenant: { include: { branding: true, contractTemplates: { where: { isDefault: true }, take: 1 } } },
    },
  });
  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const template = quote.contractTemplate ?? quote.tenant.contractTemplates[0] ?? null;
  if (!template) return NextResponse.json({ error: 'No contract template found. Add one in Settings → Contract Templates.' }, { status: 404 });

  const ctx = buildCtx({
    client: quote.client,
    event: quote.event,
    invoice: quote.event.invoices[0] ?? null,
    quote: { quoteNumber: quote.quoteNumber, totalCents: quote.totalCents },
    branding: quote.tenant.branding ?? {},
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
  });
  const html = parseMergeTags(template.bodyHtml, ctx, true);
  return NextResponse.json({ html, templateName: template.name });
}
