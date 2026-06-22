export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { sendEmail } from '@/lib/email/send';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { email, role = 'TEAM_MEMBER' } = await req.json();
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 });

  const normalizedEmail = email.toLowerCase().trim();

  // Find or create the user
  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) {
    user = await prisma.user.create({ data: { email: normalizedEmail, name: normalizedEmail.split('@')[0] } });
  }

  // Check if already a member
  const existing = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: session.tenantId, userId: user.id } },
  });
  if (existing?.status === 'ACTIVE') {
    return NextResponse.json({ error: 'This user is already a team member' }, { status: 400 });
  }

  const inviteToken = crypto.randomBytes(32).toString('hex');

  await prisma.tenantMembership.upsert({
    where: { tenantId_userId: { tenantId: session.tenantId, userId: user.id } },
    update: { role, status: 'INVITED', inviteToken },
    create: { tenantId: session.tenantId, userId: user.id, role, status: 'INVITED', inviteToken },
  });

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { name: true, branding: { select: { companyName: true } } } });
  const companyName = tenant?.branding?.companyName || tenant?.name || 'Booth Genius';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://boothgen.com';
  const inviteUrl = `${appUrl}/invite/${inviteToken}`;

  await sendEmail(
    normalizedEmail,
    `You've been invited to join ${companyName} on Booth Genius`,
    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 24px">
      <h2 style="font-size:20px;color:#111827">You've been invited!</h2>
      <p>You've been invited to join <strong>${companyName}</strong> as a team member on Booth Genius.</p>
      <p style="margin:24px 0">
        <a href="${inviteUrl}" style="background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Accept Invitation</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">If you weren't expecting this invitation, you can safely ignore this email.</p>
    </div>`
  );

  return NextResponse.json({ ok: true });
}
