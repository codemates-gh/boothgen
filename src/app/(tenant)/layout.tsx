import { requireTenantSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';
import { Sidebar } from '@/components/layout/Sidebar';
import { SupportChat } from '@/app/support/SupportChat';

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  await requireTenantSession();
  const chatSetting = await prisma.systemSetting.findUnique({ where: { key: 'chatbot_enabled' } });
  const chatbotEnabled = chatSetting?.value !== 'false';
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="lg:pl-64 pt-14 lg:pt-16">{children}</main>
      {chatbotEnabled && <SupportChat />}
    </div>
  );
}
