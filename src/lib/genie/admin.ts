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

export type TemplateAuth = { tenantId: string | null; userId: string; superAdmin: boolean };

// Template library and designer: a Genie account's HOST_ADMIN, or a BoothGen super admin. A super admin outside an
// account (Super Admin → Design Templates) works on Standard templates only (tenantId null).
export async function requireTemplateEditor(): Promise<TemplateAuth | NextResponse> {
  const session = await getServerSession(authOptions);
  if (session?.userId && session.globalRole === 'SUPER_ADMIN') {
    if (session.tenantId && session.tenantRole === 'HOST_ADMIN') {
      const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { genieEnabled: true } });
      if (tenant?.genieEnabled) return { tenantId: session.tenantId, userId: session.userId, superAdmin: true };
    }
    return { tenantId: null, userId: session.userId, superAdmin: true };
  }
  return requireGenieAdmin();
}
