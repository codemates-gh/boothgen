import { requireSuperAdminSession } from '@/lib/auth/session';
export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminSession();
  return <>{children}</>;
}
