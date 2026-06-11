import { requireTenantSession } from '@/lib/auth/session';
import { Sidebar } from '@/components/layout/Sidebar';
import { SidebarProvider } from '@/components/layout/sidebar-context';

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  await requireTenantSession();
  return (
    <div className="min-h-screen bg-gray-50">
      <SidebarProvider>
        <Sidebar />
        <main className="lg:pl-64 pt-14 lg:pt-16">{children}</main>
      </SidebarProvider>
    </div>
  );
}
