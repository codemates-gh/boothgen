import type { Metadata } from 'next';
import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { genie360Ready } from '@/lib/genie/spin360';
import { Sidebar } from '@/components/layout/Sidebar';
import { SupportChat } from '@/app/support/SupportChat';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { genieOnlyBlock, GENIE_HOME, isGenieOnly, UPGRADE_PATH } from '@/lib/product';


export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  const session = await requireTenantSession();
  const [tenant, chatSetting, subscription] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { status: true, cancelledAt: true, genieEnabled: true, product: true } }),
    prisma.systemSetting.findUnique({ where: { key: 'chatbot_enabled' } }),
    prisma.stripeSubscription.findUnique({ where: { tenantId: session.tenantId }, select: { plan: true } }),
  ]);
  // Genie-only accounts: re-checked against the database on full page loads (the sign-in token can be a few minutes
  // old; the middleware checks every request against the token)
  const genieOnly = isGenieOnly(tenant);
  if (genieOnly) {
    const path = (await headers()).get('x-pathname') ?? '';
    const block = genieOnlyBlock(path);
    if (block?.kind === 'home') redirect(GENIE_HOME);
    if (block) redirect(UPGRADE_PATH + '?from=' + encodeURIComponent(path));
  }
  const isFoundingMember = subscription?.plan === 'LIFETIME';
  const chatbotEnabled = chatSetting?.value !== 'false';
  const isCancelled = tenant?.status === 'CANCELLED';
  const lastDay = tenant?.cancelledAt
    ? new Date(new Date(tenant.cancelledAt).getTime() + 30 * 24 * 60 * 60 * 1000)
        .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <Sidebar isFoundingMember={isFoundingMember} genieEnabled={session.tenantRole === 'HOST_ADMIN' && !!tenant?.genieEnabled} genieOnly={genieOnly} genie360={!!tenant?.genieEnabled && await genie360Ready()} />
      <main className="lg:pl-64 pt-14 lg:pt-16 print:p-0">
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
