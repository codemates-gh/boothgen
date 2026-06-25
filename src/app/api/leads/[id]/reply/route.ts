export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const lead = await prisma.leadSubmission.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { subject, body, bodyHtml } = await req.json();
  if (!subject?.trim() || !(body?.trim() || bodyHtml?.trim())) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { branding: { select: { companyName: true, replyToEmail: true } } },
  });
  const companyName = tenant?.branding?.companyName || tenant?.name || 'Your Photo Booth Company';
  const contactEmail = tenant?.branding?.replyToEmail || null;

  // reply-to routes client replies back into the app via Resend inbound webhook
  const inboundDomain = process.env.RESEND_INBOUND_DOMAIN ?? 'boothgen.com';
  const replyTo = `lead-${lead.id}@${inboundDomain}`;

  // Use company name as FROM display name so it's not confusing
  const fromAddress = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
  const fromDisplay = `${companyName} <${fromAddress}>`;

  // Rich HTML from editor, or fallback to plain-text-to-HTML conversion
  const bodyContent = bodyHtml || body.replace(/\n/g, '<br/>');
  const bodyTextContent = body || bodyHtml!
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const attachmentNote = contactEmail
    ? `<p style="color:#9ca3af;font-size:11px;margin:8px 0 0">To share a file, CC <a href="mailto:${contactEmail}" style="color:#9ca3af">${contactEmail}</a> in your reply.</p>`
    : '';

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
${bodyContent}
<p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px">
  ${companyName}
</p>
${attachmentNote}
</div>`;

  const result = await sendEmail(lead.email, subject, html, replyTo, fromDisplay);
  if (!result.success) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }

  // Store the outbound message in the thread
  await prisma.leadMessage.create({
    data: {
      leadId: lead.id,
      direction: 'OUTBOUND',
      fromEmail: replyTo,
      toEmail: lead.email,
      subject,
      bodyText: bodyTextContent,
      bodyHtml: html,
    },
  });

  if (lead.status === 'NEW') {
    await prisma.leadSubmission.update({ where: { id: params.id }, data: { status: 'CONTACTED' } });
  }

  return NextResponse.json({ ok: true });
}
