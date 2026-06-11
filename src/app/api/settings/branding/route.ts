export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { slug: true, name: true, branding: true },
  });
  return NextResponse.json({ ...tenant?.branding, slug: tenant?.slug, tenantName: tenant?.name });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { companyName, primaryColor, secondaryColor, replyToEmail, supportPhone, websiteUrl, invoiceFooterText } = body;
  const branding = await prisma.tenantBranding.upsert({
    where: { tenantId: session.tenantId },
    update: { companyName, primaryColor, secondaryColor, replyToEmail, supportPhone, websiteUrl, invoiceFooterText },
    create: { tenantId: session.tenantId, companyName, primaryColor, secondaryColor, replyToEmail, supportPhone, websiteUrl, invoiceFooterText },
  });
  return NextResponse.json(branding);
}
