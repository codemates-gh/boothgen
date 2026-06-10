import { getServerSession } from 'next-auth';
import { authOptions } from './config';
import { redirect } from 'next/navigation';

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

export async function requireSuperAdminSession() {
  const session = await getServerSession(authOptions);
  if (!session?.userId) redirect('/sign-in');
  if (session.globalRole !== 'SUPER_ADMIN') redirect('/dashboard');
  return session;
}
