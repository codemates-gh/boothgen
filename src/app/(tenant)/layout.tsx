import { requireTenantSession } from '@/lib/auth/session';
import { Sidebar } from '@/components/layout/Sidebar';

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  await requireTenantSession();
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="pl-64 pt-16">{children}</main>
    </div>
  );
}
