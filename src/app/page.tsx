import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { redirect } from 'next/navigation';

export default async function RootPage() {
  const session = await getServerSession(authOptions);
  if (!session?.userId) redirect('/sign-in');
  if (session.globalRole === 'SUPER_ADMIN') redirect('/super-admin');
  if (!session.tenantId) redirect('/onboarding');
  redirect('/dashboard');
}
