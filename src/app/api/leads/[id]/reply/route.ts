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

  const { subject, body } = await req.json();
  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    include: { branding: { select: { companyName: true } } },
  });
  const companyName = tenant?.branding?.companyName || tenant?.name || 'Your Photo Booth Company';

  // reply-to routes client replies back into the app via Resend inbound webhook
  const inboundDomain = process.env.RESEND_INBOUND_DOMAIN ?? 'boothgen.com';
  const replyTo = `lead-${lead.id}@${inboundDomain}`;

  // Use company name as FROM display name so it's not confusing
  const fromAddress = process.env.EMAIL_FROM ?? 'noreply@boothgen.com';
  const fromDisplay = `${companyName} <${fromAddress}>`;

  const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
${body.replace(/\n/g, '<br/>')}
<br/><br/>
<p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:16px">
  ${companyName}
</p>
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
      bodyText: body,
      bodyHtml: html,
    },
  });

  if (lead.status === 'NEW') {
    await prisma.leadSubmission.update({ where: { id: params.id }, data: { status: 'CONTACTED' } });
  }

  return NextResponse.json({ ok: true });
}
