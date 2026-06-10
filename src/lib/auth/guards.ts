
import { prisma } from '@/lib/prisma/client';
import type { TenantRole } from '@prisma/client';
const RANK: Record<TenantRole, number> = { HOST_ADMIN: 100, TEAM_MEMBER: 10 };
export async function requireTenantRole(userId: string, min: TenantRole, tenantId?: string) {
  const where = tenantId ? { userId, tenantId, status: 'ACTIVE' as const } : { userId, status: 'ACTIVE' as const };
  const m = await prisma.tenantMembership.findFirst({ where, include: { tenant: true } });
  if (!m || RANK[m.role] < RANK[min]) return null;
  return m;
}
export async function requireSuperAdmin(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, globalRole: true } });
  return u?.globalRole === 'SUPER_ADMIN' ? u : null;
}
