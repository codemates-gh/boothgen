import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

// Admin-side Genie routes: HOST_ADMIN of a tenant that has the Genie add-on
export async function requireGenieAdmin(): Promise<{ tenantId: string; userId: string; superAdmin: boolean } | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { genieEnabled: true } });
  if (!tenant?.genieEnabled) return NextResponse.json({ error: 'Genie is not enabled for this account', code: 'genie_not_enabled' }, { status: 403 });
  return { tenantId: session.tenantId, userId: session.userId, superAdmin: session.globalRole === 'SUPER_ADMIN' };
}
