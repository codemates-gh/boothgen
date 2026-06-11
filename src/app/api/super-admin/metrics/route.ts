export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const [total, active, trial, suspended, hosts] = await Promise.all([
    prisma.tenant.count(), prisma.tenant.count({ where: { status: 'ACTIVE' } }),
    prisma.tenant.count({ where: { status: 'TRIAL' } }), prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
    prisma.tenant.findMany({ take: 100, orderBy: { createdAt: 'desc' }, include: { stripeSubscription: { select: { plan: true, status: true } }, stripeConnect: { select: { onboardingStatus: true, chargesEnabled: true } }, _count: { select: { events: true } } } }),
  ]);
  return NextResponse.json({ overview: { total, active, trial, suspended }, hosts });
}
