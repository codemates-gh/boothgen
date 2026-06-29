export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendInvoiceLink } from '@/lib/email/send';
import { triggerAutomation } from '@/lib/inngest/trigger';
import { inngest } from '@/lib/inngest/client';
const APP = process.env.NEXT_PUBLIC_APP_URL!;

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, include: { branding: true } });
  if (!tenant) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const inv = await prisma.invoice.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { client: true, event: true, PaymentMilestone: true },
  });
  if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  const portalUrl = inv.event ? APP + '/portal/' + (inv.event as any).portalToken : APP;
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);
  // Skip hardcoded email if an active automation rule covers INVOICE_SENT
  const hasInvoiceRule = inv.eventId
    ? await prisma.automationRule.count({ where: { tenantId: session.tenantId, trigger: 'INVOICE_SENT', isActive: true, actionType: 'EMAIL' } }) > 0
    : false;
  if (!hasInvoiceRule) {
    await sendInvoiceLink({ to: inv.client.email, firstName: inv.client.firstName, companyName: tenant.branding?.companyName ?? tenant.name, invoiceNumber: inv.invoiceNumber, totalFormatted: fmt(inv.totalCents), portalUrl });
  }
  await prisma.invoice.update({ where: { id: inv.id }, data: { status: 'SENT' } });
  if (inv.eventId) {
    triggerAutomation({ tenantId: session.tenantId, eventId: inv.eventId, trigger: 'INVOICE_SENT' }).catch(e =>
      console.error('[invoice/send] INVOICE_SENT automation error:', e)
    );
  }

  // Schedule event-driven "due today" reminders for each future unpaid milestone.
  // This fires exactly on time regardless of the daily cron window.
  const now = new Date();
  for (const ms of inv.PaymentMilestone) {
    const due = new Date(ms.dueDate);
    if (due <= now) continue; // already past due — the cron will handle it at next run
    inngest.send({
      name: 'payment/milestone-due',
      data: { milestoneId: ms.id },
      ts: due.getTime(),
    }).catch(e => console.error('[invoice/send] milestone-due schedule error:', e));
  }

  return NextResponse.redirect(new URL('/invoices/' + inv.id, APP));
}
