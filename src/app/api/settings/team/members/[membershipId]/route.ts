export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { membershipId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const membership = await prisma.tenantMembership.findFirst({
    where: { id: params.membershipId, tenantId: session.tenantId },
  });
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Can't change your own role
  if (membership.userId === session.userId) {
    return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
  }

  const { role } = await req.json();
  if (!['HOST_ADMIN', 'TEAM_MEMBER'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  const updated = await prisma.tenantMembership.update({
    where: { id: params.membershipId },
    data: { role },
    include: { user: { select: { name: true, email: true } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { membershipId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const membership = await prisma.tenantMembership.findFirst({
    where: { id: params.membershipId, tenantId: session.tenantId },
  });
  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Can't remove yourself
  if (membership.userId === session.userId) {
    return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 });
  }

  // Ensure at least one HOST_ADMIN remains
  if (membership.role === 'HOST_ADMIN') {
    const adminCount = await prisma.tenantMembership.count({
      where: { tenantId: session.tenantId, role: 'HOST_ADMIN', status: 'ACTIVE' },
    });
    if (adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot remove the only admin' }, { status: 400 });
    }
  }

  await prisma.tenantMembership.delete({ where: { id: params.membershipId } });
  return NextResponse.json({ ok: true });
}
