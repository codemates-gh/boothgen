export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { triggerAutomation } from '@/lib/inngest/trigger';
import { sendQuoteLink } from '@/lib/email/send';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Guard: require Stripe Connect with charges enabled before sending quotes
  const stripeConnect = await prisma.stripeConnectAccount.findUnique({ where: { tenantId: session.tenantId } });
  if (!stripeConnect?.chargesEnabled) {
    return NextResponse.json({
      error: 'You must connect your Stripe account and complete onboarding before sending quotes. Go to Settings → Billing to connect.',
      stripeRequired: true,
    }, { status: 400 });
  }

  const q = await prisma.quote.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { client: true, event: true, tenant: { include: { branding: true } } },
  });
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.quote.update({ where: { id: params.id }, data: { status: 'SENT', sentAt: new Date() } });

  // Advance event status to QUOTED if still at LEAD
  if (q.event.status === 'LEAD') {
    await prisma.event.update({ where: { id: q.eventId }, data: { status: 'QUOTED' } });
  }

  const branding = q.tenant.branding;
  const companyName = branding?.companyName ?? q.tenant.name;
  const emailFrom = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
  const fromAddress = companyName ? `${companyName} <${emailFrom}>` : emailFrom;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
  const portalUrl = appUrl + '/portal/' + q.event.portalToken + '?tab=quote';
  const fmt = (c: number) => fmtCents(c, quote.currency ?? 'usd');

  // Skip hardcoded email if an active automation rule covers QUOTE_SENT
  const hasQuoteRule = await prisma.automationRule.count({
    where: { tenantId: session.tenantId, trigger: 'QUOTE_SENT', isActive: true, actionType: 'EMAIL' },
  }) > 0;
  let emailResult: any = null;
  if (!hasQuoteRule) {
    emailResult = await sendQuoteLink({
      to: q.client.email,
      firstName: q.client.firstName,
      companyName,
      quoteNumber: q.quoteNumber,
      totalFormatted: fmt(q.totalCents),
      portalUrl,
      replyTo: branding?.replyToEmail ?? undefined,
      from: fromAddress,
    });
    console.log('[QUOTE_SEND] to:', q.client.email, 'from:', fromAddress, 'result:', JSON.stringify(emailResult));
  }

  triggerAutomation({ tenantId: session.tenantId, eventId: q.eventId, trigger: 'QUOTE_SENT' }).catch(e =>
    console.error('[QUOTE_SEND] automation error:', e)
  );

  return NextResponse.json({ ...updated, _email: emailResult });
}
