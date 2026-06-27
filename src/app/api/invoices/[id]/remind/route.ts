export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendPaymentReminderEmail } from '@/lib/email/send';

const APP = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const inv = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: {
      client: true,
      event: true,
      PaymentMilestone: { where: { status: { notIn: ['PAID', 'REFUNDED'] } }, orderBy: { dueDate: 'asc' }, take: 1 },
      tenant: { include: { branding: true } },
    },
  });
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  if (inv.balanceDueCents <= 0) return NextResponse.json({ error: 'No balance due' }, { status: 400 });

  const branding = inv.tenant.branding;
  const companyName = branding?.companyName ?? inv.tenant.name;
  const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

  // Use earliest unpaid milestone due date, fall back to invoice-level dueDate
  const milestoneDate = inv.PaymentMilestone[0]?.dueDate;
  const rawDue = milestoneDate ?? inv.dueDate;
  const dueDateStr = rawDue
    ? new Date(rawDue).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'N/A';

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const dueDayStart = rawDue ? new Date(rawDue) : null;
  if (dueDayStart) dueDayStart.setHours(0, 0, 0, 0);
  const isOverdue = dueDayStart ? dueDayStart < todayStart : false;

  const portalUrl = inv.event
    ? `${APP}/portal/${(inv.event as any).portalToken}?tab=invoice`
    : APP;

  await sendPaymentReminderEmail({
    to: inv.client.email,
    firstName: inv.client.firstName,
    companyName,
    invoiceNumber: inv.invoiceNumber,
    amountDueFormatted: fmt(inv.balanceDueCents),
    dueDate: dueDateStr,
    portalUrl,
    isOverdue,
    replyTo: branding?.replyToEmail ?? undefined,
    from: companyName ? `${companyName} <${emailFrom}>` : emailFrom,
  });

  return NextResponse.redirect(new URL('/invoices/' + inv.id + '?reminded=1', APP));
}
