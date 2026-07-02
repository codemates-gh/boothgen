export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!event) return NextResponse.json([], { status: 404 });

  const messages = await prisma.leadMessage.findMany({
    where: {
      OR: [
        { eventId: params.id },
        { lead: { convertedToEventId: params.id } },
      ],
    },
    orderBy: { sentAt: 'asc' },
  });

  return NextResponse.json(messages);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const event = await prisma.event.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    include: { client: true, leadSubmission: { select: { id: true } } },
  });
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const { subject, body, bodyHtml } = await req.json();
  if (!subject?.trim() || !(body?.trim() || bodyHtml?.trim())) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { branding: { select: { companyName: true, replyToEmail: true } } },
  });
  const companyName = tenant?.branding?.companyName || tenant?.name || 'Your Photo Booth Company';

  const inboundDomain = process.env.RESEND_INBOUND_DOMAIN ?? 'boothgen.com';
  const leadId = (event as any).leadSubmission?.id ?? null;
  // Route inbound replies to lead thread if one exists, otherwise event thread
  const replyTo = leadId
    ? `lead-${leadId}@${inboundDomain}`
    : `event-${event.id}@${inboundDomain}`;

  const fromAddress = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
  const fromDisplay = `${companyName} <${fromAddress}>`;

  const bodyContent = bodyHtml || body.replace(/\n/g, '<br/>');
  const bodyTextContent = body || bodyHtml!
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
${bodyContent}
<p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px">${companyName}</p>
</div>`;

  const result = await sendEmail(event.client.email, subject, html, replyTo, fromDisplay);
  if (!result.success) return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });

  const message = await prisma.leadMessage.create({
    data: {
      tenantId: session.tenantId,
      leadId,
      eventId: event.id,
      direction: 'OUTBOUND',
      fromEmail: replyTo,
      toEmail: event.client.email,
      subject,
      bodyText: bodyTextContent,
      bodyHtml: html,
    },
  });

  return NextResponse.json(message, { status: 201 });
}
