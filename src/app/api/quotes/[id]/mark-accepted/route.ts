export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { parseMergeTags, buildCtx } from '@/lib/contracts/merge-tags';
import { sendHostNotificationEmail } from '@/lib/email/send';

// Admin bypass: mark a quote accepted without requiring the client portal flow.
// Used when a quote is accepted via phone, email, or other out-of-band channel.
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const quote = await prisma.quote.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: {
      event: { include: { invoices: { take: 1, orderBy: { createdAt: 'desc' } } } },
      client: true,
      contractTemplate: true,
      tenant: {
        include: {
          branding: true,
          contractTemplates: { where: { isDefault: true }, take: 1 },
          memberships: { where: { role: 'HOST_ADMIN' }, include: { user: { select: { email: true } } } },
        },
      },
    },
  });

  if (!quote) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (quote.status !== 'SENT' && quote.status !== 'VIEWED') {
    return NextResponse.json({ error: 'Only SENT or VIEWED quotes can be manually accepted' }, { status: 400 });
  }

  const now = new Date();
  const template = quote.contractTemplate ?? quote.tenant.contractTemplates[0] ?? null;

  let renderedContent = '<p>Thank you for accepting this quote.</p>';
  let templateContent = renderedContent;
  if (template) {
    const ctx = buildCtx({
      client: quote.client,
      event: quote.event,
      invoice: quote.event.invoices[0] ?? null,
      branding: quote.tenant.branding ?? {},
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
    });
    templateContent = template.bodyHtml;
    renderedContent = parseMergeTags(template.bodyHtml, ctx);
  }

  // Check if a contract already exists for this event to avoid duplicates
  const existingContract = await prisma.contract.findFirst({
    where: { eventId: quote.eventId, tenantId: session.tenantId },
  });

  await prisma.$transaction(async (tx) => {
    await tx.quote.update({
      where: { id: params.id },
      data: { status: 'ACCEPTED', acceptedAt: now },
    });
    await tx.event.update({ where: { id: quote.eventId }, data: { status: 'BOOKED' } });
    if (!existingContract) {
      await tx.contract.create({
        data: {
          tenantId: quote.tenantId,
          eventId: quote.eventId,
          clientId: quote.clientId,
          templateId: template?.id ?? null,
          title: 'Services Agreement — ' + quote.event.title,
          templateContent,
          renderedContent,
          status: 'DRAFT',
        },
      });
    }
  });

  const hostEmails = quote.tenant.memberships.map((m: any) => m.user.email).filter(Boolean);
  if (hostEmails.length > 0) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
    const companyName = quote.tenant.branding?.companyName ?? quote.tenant.name;
    sendHostNotificationEmail({
      to: hostEmails,
      subject: `Quote manually accepted — ${quote.event.title}`,
      heading: `Quote ${quote.quoteNumber} marked as accepted`,
      body: `Quote <strong>${quote.quoteNumber}</strong> for <strong>${quote.event.title}</strong> has been manually marked as accepted by the operator. ${existingContract ? 'A contract already exists for this event.' : 'A contract draft has been created.'}`,
      ctaLabel: 'View Event',
      ctaUrl: `${appUrl}/events/${quote.eventId}`,
      from: companyName ? `${companyName} via Booth Genius <${process.env.EMAIL_FROM ?? 'noreply@boothgen.com'}>` : undefined,
    }).catch(e => console.error('[quote/mark-accepted] host notification error:', e));
  }

  return NextResponse.json({ success: true, contractCreated: !existingContract });
}
