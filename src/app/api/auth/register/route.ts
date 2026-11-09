export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';

// In-memory rate limit: 3 registrations per IP per 10 minutes
const registerAttempts = new Map<string, { count: number; reset: number }>();
function checkRegisterRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = registerAttempts.get(ip);
  if (!entry || now > entry.reset) {
    registerAttempts.set(ip, { count: 1, reset: now + 10 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 3) return false;
  entry.count++;
  return true;
}

function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
  });
  const data = await res.json();
  return data.success === true;
}

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
  const { name, email, password, website, turnstileToken } = await req.json();

  // Honeypot: bots fill the hidden website field, humans don't
  if (website) return NextResponse.json({ success: true }); // silent fake success

  const ip = getClientIp(req);

  // IP rate limit
  if (!checkRegisterRateLimit(ip))
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

  // Turnstile verification
  const human = await verifyTurnstile(turnstileToken, ip);
  if (!human)
    return NextResponse.json({ error: 'Security verification failed. Please refresh and try again.' }, { status: 400 });

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
