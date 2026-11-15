export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma/client';
import { productParam, sendVerificationEmail } from '@/lib/auth/emailVerification';

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

export async function POST(req: NextRequest) {
  const { name, email, password, website, turnstileToken, product } = await req.json();

  // Honeypot: bots fill the hidden website field, humans don't
  if (website) return NextResponse.json({ success: true, verify: true }); // silent fake success

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

  // Confirm the email before the first sign-in; the welcome email follows the confirmation
  try {
    await sendVerificationEmail(user, productParam(product));
  } catch (err) {
    console.error('[register] verification email error:', err);
  }

  return NextResponse.json({ success: true, verify: true });
}
