// Where a client's reply to a BoothGen email lands: the operator's own inbox. The reply-to set in
// Settings → Email & Texting, or else the account admin's login email, so replies never go to the no-reply sender.
import { prisma } from '@/lib/prisma/client';

export async function clientReplyTo(tenantId: string, replyToEmail?: string | null): Promise<string | null> {
  if (replyToEmail?.trim()) return replyToEmail.trim();
  const admin = await prisma.tenantMembership.findFirst({
    where: { tenantId, status: 'ACTIVE', role: 'HOST_ADMIN' },
    orderBy: { createdAt: 'asc' },
    select: { user: { select: { email: true } } },
  });
  return admin?.user.email ?? null;
}
