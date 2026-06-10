import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendInvoiceLink } from '@/lib/email/send';
const APP = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { branding: true } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const inv = await prisma.invoice.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true } });
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const portalUrl = inv.event ? APP + '/portal/' + (inv.event as any).portalToken : APP;
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  await sendInvoiceLink({ to: inv.client.email, firstName: inv.client.firstName, companyName: tenant.branding?.companyName ?? tenant.name, invoiceNumber: inv.invoiceNumber, totalFormatted: fmt(inv.totalCents), portalUrl });
  await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'SENT' } });
  return NextResponse.redirect(new URL('/invoices/' + inv.id, APP));
}
