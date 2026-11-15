export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { markEmailVerified, productParam, readVerificationToken } from '@/lib/auth/emailVerification';
import { sendWelcomeEmail } from '@/lib/auth/welcomeEmail';

// The link in the confirmation email: confirms the address, then sends the person to sign in and on to onboarding
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? '';
  const product = productParam(req.nextUrl.searchParams.get('product'));
  const userId = await readVerificationToken(token);
  if (!userId) return NextResponse.redirect(new URL('/sign-in?verify=expired', req.url));

  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true, emailVerifiedAt: true } });
  await markEmailVerified(userId);
  if (!before.emailVerifiedAt) await sendWelcomeEmail(before).catch(e => console.error('[verify-email] welcome email error:', e));

  const next = '/onboarding' + (product ? '?product=' + (product === 'crm' ? 'genius' : 'genie') : '');
  const url = new URL('/sign-in', req.url);
  url.searchParams.set('verified', '1');
  url.searchParams.set('email', before.email);
  url.searchParams.set('callbackUrl', next);
  return NextResponse.redirect(url);
}
