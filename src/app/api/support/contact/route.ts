import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';

export async function POST(req: NextRequest) {
  const { question, email } = await req.json();

  if (!question?.trim()) {
    return NextResponse.json({ error: 'Question is required.' }, { status: 400 });
  }

  const setting = await prisma.systemSetting.findUnique({ where: { key: 'support_email' } });
  const supportEmail = setting?.value || process.env.EMAIL_FROM;

  if (!supportEmail) {
    return NextResponse.json({ error: 'Support email not configured.' }, { status: 503 });
  }

  const fromLabel = email ? `${email} via Booth Genius Support` : 'Booth Genius Support Page';
  const subject = 'Support request from Booth Genius support page';
  const html =
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">` +
    `<h2 style="font-size:18px;color:#111827;margin:0 0 16px">New Support Request</h2>` +
    `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:24px">` +
    `<p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;font-weight:600">Question</p>` +
    `<p style="margin:0;color:#111827;font-size:15px;line-height:1.6;white-space:pre-wrap">${question.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>` +
    `</div>` +
    `${email ? `<p style="color:#6b7280;font-size:13px;">Submitted by: <strong>${email}</strong></p>` : `<p style="color:#6b7280;font-size:13px;font-style:italic">No email provided — reply not possible.</p>`}` +
    `<p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px">Sent from the Booth Genius support page</p>` +
    `</div>`;

  await sendEmail(supportEmail, subject, html, email || undefined);

  return NextResponse.json({ ok: true });
}
