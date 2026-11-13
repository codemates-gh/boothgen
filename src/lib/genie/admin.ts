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

// Template library and designer (Templates): any account's HOST_ADMIN (not Genie-only), or a BoothGen super admin.
// A super admin outside an account (Super Admin → Design Templates) works on Standard templates only (tenantId null).
export async function requireTemplateEditor(): Promise<TemplateAuth | NextResponse> {
  const session = await getServerSession(authOptions);
  const superAdmin = session?.globalRole === 'SUPER_ADMIN';
  if (session?.userId && session.tenantId && session.tenantRole === 'HOST_ADMIN') return { tenantId: session.tenantId, userId: session.userId, superAdmin };
  if (session?.userId && superAdmin) return { tenantId: null, userId: session.userId, superAdmin: true };
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

// Super Admin API routes (JSON 401 instead of a sign-in redirect)
export async function requireSuperAdminApi(): Promise<{ userId: string } | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.userId || session.globalRole !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return { userId: session.userId };
}

// Library uploads (props, backdrops): Standard needs a BoothGen super admin; the account's own needs its Genie admin
export async function requireLibraryEditor(scope: 'standard' | 'mine'): Promise<{ tenantId: string | null } | NextResponse> {
  if (scope === 'standard') {
    const sa = await requireSuperAdminApi();
    return sa instanceof NextResponse ? NextResponse.json({ error: 'Only Booth Genius can change the Standard library' }, { status: 403 }) : { tenantId: null };
  }
  const auth = await requireGenieAdmin();
  return auth instanceof NextResponse ? auth : { tenantId: auth.tenantId };
}
