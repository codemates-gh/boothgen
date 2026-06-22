export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { inngest } from '@/lib/inngest/client';
import { sendQuoteLink } from '@/lib/email/send';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  const fmt = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

  // Always send the transactional quote email directly
  const emailResult = await sendQuoteLink({
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

  // Fire Inngest separately for any QUOTE_SENT automation rules the tenant has configured
  inngest.send({ name: 'quote/sent', data: { tenantId: session.tenantId, eventId: q.eventId } }).catch(e =>
    console.error('[QUOTE_SEND] Inngest error:', e)
  );

  return NextResponse.json({ ...updated, _email: emailResult });
}
