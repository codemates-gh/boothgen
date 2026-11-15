export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { checkRateLimit } from '@/lib/rate-limit';
import { sendVerificationEmail } from '@/lib/auth/emailVerification';

// "Send the link again" on the sign-in and sign-up pages. Always answers ok, so it doesn't reveal who has an account.
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !email.includes('@')) return NextResponse.json({ error: 'Enter your email' }, { status: 400 });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const address = email.trim().toLowerCase();
  if (!checkRateLimit('resend-verify:' + ip, 5, 600000).success || !checkRateLimit('resend-verify:' + address, 3, 600000).success) {
    return NextResponse.json({ ok: true });
  }
  const user = await prisma.user.findUnique({ where: { email: address }, select: { id: true, email: true, name: true, emailVerifiedAt: true, passwordHash: true } });
  if (user && !user.emailVerifiedAt && user.passwordHash) {
    await sendVerificationEmail(user).catch(e => console.error('[resend-verification]', e));
  }
  return NextResponse.json({ ok: true });
}
