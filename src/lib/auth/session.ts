import { getServerSession } from 'next-auth';
import { authOptions } from './config';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma/client';

export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.userId) redirect('/sign-in');
  return session;
}

export async function requireTenantSession() {
  const session = await getServerSession(authOptions);
  if (!session?.userId) redirect('/sign-in');
  if (!session?.tenantId) redirect('/onboarding');
  return session as typeof session & { tenantId: string; tenant: NonNullable<typeof session.tenant> };
}

export async function hasProAccess(tenantId: string): Promise<boolean> {
  const sub = await prisma.stripeSubscription.findUnique({
    where: { tenantId },
    select: { plan: true, status: true },
  });
  if (!sub) return false;
  return (sub.plan === 'MONTHLY' || sub.plan === 'ANNUAL') &&
         (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE');
}

export async function requireSuperAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.userId) redirect('/sign-in');
  if (session.globalRole !== 'SUPER_ADMIN') redirect('/dashboard');
  return session;
}
