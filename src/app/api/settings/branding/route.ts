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
    select: { slug: true, name: true, branding: true, teamMemberAccess: true },
  });
  return NextResponse.json({ ...tenant?.branding, slug: tenant?.slug, tenantName: tenant?.name, teamMemberAccess: tenant?.teamMemberAccess ?? '["events"]' });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { companyName, primaryColor, secondaryColor, replyToEmail, supportPhone, websiteUrl, businessAddress, invoiceFooterText, emailHeaderHtml, logoUrl, defaultDepositPercent, balanceDueDaysBeforeEvent, fullPaymentIfWithinDays, leadFormConfig } = body;
  const updateData: any = { companyName, primaryColor, secondaryColor, replyToEmail, supportPhone, websiteUrl, businessAddress, invoiceFooterText, emailHeaderHtml };
  if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
  if (defaultDepositPercent !== undefined) updateData.defaultDepositPercent = parseInt(defaultDepositPercent);
  if (balanceDueDaysBeforeEvent !== undefined) updateData.balanceDueDaysBeforeEvent = parseInt(balanceDueDaysBeforeEvent);
  if (fullPaymentIfWithinDays !== undefined) updateData.fullPaymentIfWithinDays = parseInt(fullPaymentIfWithinDays);
  if (leadFormConfig !== undefined) updateData.leadFormConfig = leadFormConfig;
  const branding = await prisma.tenantBranding.upsert({
    where: { tenantId: session.tenantId },
    update: updateData,
    create: { tenantId: session.tenantId, ...updateData },
  });
  return NextResponse.json(branding);
}
