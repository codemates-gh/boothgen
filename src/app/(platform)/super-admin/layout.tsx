import type { Metadata } from 'next';
import { requireSuperAdminSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminSession();
  return <>{children}</>;
}
