export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { SignJWT } from 'jose';
import { sendEmail } from '@/lib/email/send';

export async function POST(req: NextRequest) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  // Always return 200 to prevent email enumeration
  if (!user || !user.passwordHash) return NextResponse.json({ ok: true });

  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);
  const token = await new SignJWT({ userId: user.id, email: user.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .sign(secret);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://boothgen.com';
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;

  await sendEmail(
    user.email,
    'Reset your Booth Genius password',
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
      <h2 style="font-size:20px;color:#111827">Reset your password</h2>
      <p>We received a request to reset the password for your Booth Genius account.</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Reset Password</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    </div>`
  );

  return NextResponse.json({ ok: true });
}
