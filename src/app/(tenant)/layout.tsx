import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { SupportChat } from '@/app/support/SupportChat';
import Link from 'next/link';

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const session = await requireTenantSession();
  const [tenant, chatSetting] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { status: true, cancelledAt: true } }),
    prisma.systemSetting.findUnique({ where: { key: 'chatbot_enabled' } }),
  ]);
  const chatbotEnabled = chatSetting?.value !== 'false';
  const isCancelled = tenant?.status === 'CANCELLED';
  const lastDay = tenant?.cancelledAt
    ? new Date(new Date(tenant.cancelledAt).getTime() + 30 * 24 * 60 * 60 * 1000)
        .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="lg:pl-64 pt-14 lg:pt-16">
        {isCancelled && (
          <div className="bg-red-600 text-white px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Account cancelled.</strong>
              {lastDay ? ` Your data is accessible until ${lastDay}.` : ' Export your data before it is permanently deleted.'}
            </span>
            <Link href="/settings/billing" className="underline font-medium whitespace-nowrap">Export data →</Link>
          </div>
        )}
        {children}
      </main>
      {chatbotEnabled && <SupportChat />}
    </div>
  );
}
