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

  const [tenant, priorMessages] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: session.tenantId },
      include: { branding: { select: { companyName: true, replyToEmail: true } } },
    }),
    prisma.leadMessage.findMany({
      where: {
        OR: [
          { eventId: params.id },
          { lead: { convertedToEventId: params.id } },
        ],
      },
      orderBy: { sentAt: 'desc' },
      take: 5,
      select: { id: true, direction: true, fromEmail: true, bodyText: true, sentAt: true, resendId: true },
    }),
  ]);

  const companyName = tenant?.branding?.companyName || tenant?.name || 'Your Photo Booth Company';
  const contactEmail = tenant?.branding?.replyToEmail || null;
  const attachmentNote = contactEmail
    ? `<p style="color:#9ca3af;font-size:11px;margin:8px 0 0">To share a file, CC <a href="mailto:${contactEmail}" style="color:#9ca3af">${contactEmail}</a> in your reply.</p>`
    : '';

  const inboundDomain = process.env.RESEND_INBOUND_DOMAIN ?? 'boothgen.com';
  const leadId = (event as any).leadSubmission?.id ?? null;
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

  // Build quoted history (oldest-first so it reads naturally below the new message)
  const clientName = `${event.client.firstName} ${event.client.lastName}`;
  const quotedHtml = priorMessages.length > 0
    ? `<div style="margin-top:32px;padding-top:20px;border-top:1px solid #e5e7eb">
        <p style="font-size:12px;color:#9ca3af;margin:0 0 12px;font-style:italic">— Previous conversation —</p>
        ${[...priorMessages].reverse().map(m => {
          const dateStr = new Date(m.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
          const senderLabel = m.direction === 'OUTBOUND' ? companyName : clientName;
          const msgBody = (m.bodyText ?? '').replace(/\n/g, '<br/>');
          return `<div style="border-left:3px solid #e5e7eb;padding-left:14px;margin-bottom:16px;color:#6b7280;font-size:13px">
            <p style="margin:0 0 4px;font-size:11px;color:#9ca3af">${senderLabel} &middot; ${dateStr}</p>
            <p style="margin:0;line-height:1.5">${msgBody}</p>
          </div>`;
        }).join('')}
      </div>`
    : '';

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
${bodyContent}
<p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px">${companyName}</p>
${attachmentNote}
${quotedHtml}
</div>`;

  // Set In-Reply-To if there's a prior message with a Resend ID
  const lastWithResendId = priorMessages.find(m => m.resendId);
  const extraHeaders: Record<string, string> = {};
  if (lastWithResendId?.resendId) {
    extraHeaders['In-Reply-To'] = `<${lastWithResendId.resendId}@resend.dev>`;
    extraHeaders['References'] = priorMessages
      .filter(m => m.resendId)
      .map(m => `<${m.resendId}@resend.dev>`)
      .join(' ');
  }

  const result = await sendEmail(event.client.email, subject, html, replyTo, fromDisplay, extraHeaders);
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
      resendId: result.id ?? null,
    },
  });

  return NextResponse.json(message, { status: 201 });
}
