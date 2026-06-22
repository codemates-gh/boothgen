export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import bcrypt from 'bcryptjs';

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  const membership = await prisma.tenantMembership.findUnique({
    where: { inviteToken: params.token },
    include: { user: { select: { email: true, name: true, passwordHash: true } }, tenant: { select: { name: true, branding: { select: { companyName: true } } } } },
  });
  if (!membership || membership.status !== 'INVITED') {
    return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 });
  }
  return NextResponse.json({
    email: membership.user.email,
    hasPassword: !!membership.user.passwordHash,
    companyName: membership.tenant.branding?.companyName || membership.tenant.name,
    role: membership.role,
  });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { password } = await req.json();
  const membership = await prisma.tenantMembership.findUnique({
    where: { inviteToken: params.token },
    include: { user: true },
  });
  if (!membership || membership.status !== 'INVITED') {
    return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 404 });
  }

  // Set password if user doesn't have one
  if (password) {
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    const hash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: membership.userId }, data: { passwordHash: hash } });
  }

  await prisma.tenantMembership.update({
    where: { id: membership.id },
    data: { status: 'ACTIVE', inviteToken: null, joinedAt: new Date() },
  });

  return NextResponse.json({ ok: true, email: membership.user.email });
}
