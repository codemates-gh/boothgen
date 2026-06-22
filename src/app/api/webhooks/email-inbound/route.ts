export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';

async function fetchEmailBody(emailId: string): Promise<{ text: string | null; html: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !emailId) return { text: null, html: null };
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return { text: null, html: null };
    const email = await res.json();
    return { text: email.text ?? null, html: email.html ?? null };
  } catch {
    return { text: null, html: null };
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  let payload: any;

  if (secret) {
    const headers = {
      'svix-id': req.headers.get('svix-id') ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    };
    try {
      const wh = new Webhook(secret);
      payload = wh.verify(rawBody, headers);
    } catch (err) {
      console.error('[INBOUND_WEBHOOK] Signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
  } else {
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  }

  if (payload.type !== 'email.received') {
    return NextResponse.json({ ok: true });
  }

  const data = payload.data;

  let toAddresses: string[] = [];
  if (Array.isArray(data.to)) {
    toAddresses = data.to;
  } else if (typeof data.to === 'string') {
    toAddresses = data.to.split(',').map((s: string) => s.trim());
  }

  for (const toAddr of toAddresses) {
    const match = toAddr.match(/lead-([a-z0-9]+)@/i);
    if (!match) continue;
    const leadId = match[1];

    const lead = await prisma.leadSubmission.findUnique({
      where: { id: leadId },
      include: { tenant: { include: { memberships: { where: { role: 'HOST_ADMIN' }, include: { user: { select: { email: true } } } }, branding: { select: { companyName: true } } } } },
    });
    if (!lead) {
      console.error('[INBOUND_WEBHOOK] Lead not found:', leadId);
      continue;
    }

    // Webhook omits body — fetch from Resend API
    const { text: fetchedText, html: fetchedHtml } = await fetchEmailBody(data.email_id);
    const rawText = data.text || fetchedText || null;
    const rawHtml = data.html || fetchedHtml || null;

    const stripQuoted = (text: string) =>
      text
        .split(/\n\nOn [\s\S]{0,200}wrote:/)[0]
        .split(/\n-- \n/)[0]
        .trim();

    const bodyText = rawText
      ? stripQuoted(rawText)
      : rawHtml
      ? stripQuoted(
          rawHtml
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<div[^>]*gmail_quote[^>]*>[\s\S]*?<\/div>/gi, '')
            .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim()
        )
      : null;

    await prisma.leadMessage.create({
      data: {
        leadId,
        direction: 'INBOUND',
        fromEmail: data.from ?? '',
        toEmail: toAddr,
        subject: data.subject ?? '(no subject)',
        bodyText,
        bodyHtml: null,
      },
    });

    if (lead.status === 'NEW') {
      await prisma.leadSubmission.update({ where: { id: leadId }, data: { status: 'CONTACTED' } });
    }

    // Email notification to all HOST_ADMINs
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
    const companyName = lead.tenant.branding?.companyName ?? lead.tenant.name;
    const leadName = `${lead.firstName} ${lead.lastName}`;
    const preview = bodyText ? bodyText.slice(0, 120) + (bodyText.length > 120 ? '…' : '') : '';
    const leadUrl = `${appUrl}/leads/${leadId}`;

    const html = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
<h2 style="font-size:18px;color:#111827;margin:0 0 8px">💬 ${leadName} replied to their inquiry</h2>
${preview ? `<p style="color:#374151;background:#f3f4f6;border-left:3px solid #f97316;padding:12px 16px;border-radius:4px;margin:16px 0;font-style:italic">"${preview}"</p>` : ''}
<p style="margin:24px 0">
  <a href="${leadUrl}" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">View &amp; Reply in Booth Genius</a>
</p>
<p style="color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:16px">${companyName}</p>
</div>`;

    for (const member of lead.tenant.memberships) {
      await sendEmail(
        member.user.email,
        `${leadName} replied to their inquiry`,
        html,
      );
    }

    console.log('[INBOUND_WEBHOOK] Stored + notified for lead:', leadId);
  }

  return NextResponse.json({ ok: true });
}
