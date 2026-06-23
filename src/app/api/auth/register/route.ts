export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';

const DEFAULT_WELCOME_SUBJECT = 'Welcome to Booth Genius!';
const DEFAULT_WELCOME_BODY = `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
  <h2 style="font-size:22px;color:#111827">Welcome to Booth Genius, {{user_name}}!</h2>
  <p style="color:#374151">We're thrilled to have you on board. Your account is ready — set up your company profile and start managing your photo booth business in minutes.</p>
  <p style="margin:28px 0">
    <a href="{{app_url}}/onboarding" style="background:#F97316;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Get Started</a>
  </p>
  <p style="color:#6b7280;font-size:13px;">If you have any questions, just reply to this email — we're here to help.</p>
  <p style="color:#6b7280;font-size:13px;">— The Booth Genius Team</p>
</div>`;

function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/{{(\w+)}}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export async function POST(req: NextRequest) {
  const { name, email, password } = await req.json();
  if (!name?.trim() || !email?.trim() || !password)
    return NextResponse.json({ error: 'All fields required' }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing)
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { name: name.trim(), email: email.toLowerCase(), passwordHash } });

  // Send welcome email — use platform template if customized, otherwise default
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'email_template_welcome' } });
    let subject = DEFAULT_WELCOME_SUBJECT;
    let bodyHtml = DEFAULT_WELCOME_BODY;
    if (setting?.value) {
      try {
        const tpl = JSON.parse(setting.value);
        if (tpl.subject) subject = tpl.subject;
        if (tpl.bodyHtml) bodyHtml = tpl.bodyHtml;
      } catch {}
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://boothgen.com';
    const vars = { user_name: user.name ?? email, app_url: appUrl };
    await sendEmail(user.email, renderTemplate(subject, vars), renderTemplate(bodyHtml, vars));
  } catch (err) {
    console.error('[register] welcome email error:', err);
  }

  return NextResponse.json({ success: true });
}
