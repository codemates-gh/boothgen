import { SignJWT, jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';
import { isProduct, type Product } from '@/lib/product';

// Email confirmation for email-and-password sign-ups (Genie-only stage 3, docs/genie/genie-only-plan.md).
// The link is a signed token (like password reset), valid 24 hours, tied to the address it was sent to.

const PURPOSE = 'verify-email';
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';
const secret = () => new TextEncoder().encode(process.env.NEXTAUTH_SECRET!);

export const EMAIL_NOT_VERIFIED = 'EMAIL_NOT_VERIFIED';

export async function verificationLink(user: { id: string; email: string }, product?: Product | null): Promise<string> {
  const token = await new SignJWT({ userId: user.id, email: user.email, purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('24h').sign(secret());
  return `${appUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}${product ? '&product=' + product : ''}`;
}

export async function sendVerificationEmail(user: { id: string; email: string; name: string | null }, product?: Product | null) {
  const link = await verificationLink(user, product);
  const name = user.name?.trim() || 'there';
  await sendEmail(user.email, 'Confirm your BoothGen email', `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
  <h2 style="font-size:20px;color:#111827">Hi ${name.replace(/[<>&"]/g, '')},</h2>
  <p style="color:#374151">Confirm your email to finish setting up your BoothGen account.</p>
  <p style="margin:28px 0"><a href="${link}" style="background:#F97316;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">Confirm Email</a></p>
  <p style="color:#6b7280;font-size:13px;">This link works for 24 hours. If you didn't sign up, you can ignore this email.</p>
</div>`);
}

// The confirmed user's id, or null for a bad, expired or outdated link
export async function readVerificationToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== PURPOSE || typeof payload.userId !== 'string') return null;
    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { id: true, email: true } });
    return user && user.email === payload.email ? user.id : null;
  } catch {
    return null;
  }
}

export async function markEmailVerified(userId: string) {
  await prisma.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
}

// ?product= in links: "genie" or "genius" (the CRM; "crm" works too)
export const productParam = (v: string | null | undefined): Product | null => (v === 'genius' ? 'crm' : isProduct(v) ? v : null);
