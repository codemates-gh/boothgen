import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

let globalRole = 'SUPER_ADMIN';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: 't-admin', tenantRole: 'HOST_ADMIN', globalRole })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/tenant/cleanup', () => ({ deleteTenant: vi.fn() }));

import { prisma } from '@/lib/prisma/client';
import { PATCH } from '@/app/api/super-admin/tenants/[id]/route';
import { req, resetDb, seedTenant } from './helpers';

const patch = (id: string, body: unknown) => PATCH(req('/x', { method: 'PATCH', body }), { params: { id } });

beforeEach(resetDb);
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('super admin Genie switch', () => {
  it('turns Genie on and off for one tenant', async () => {
    const { tenant } = await seedTenant({ genieEnabled: false });
    const other = await seedTenant({ genieEnabled: false });
    globalRole = 'SUPER_ADMIN';
    expect((await patch(tenant.id, { genieEnabled: true })).status).toBe(200);
    const on = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(on.genieEnabled).toBe(true);
    expect(on.genieEnabledAt).toBeInstanceOf(Date);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: other.tenant.id } })).genieEnabled).toBe(false);
    await patch(tenant.id, { genieEnabled: false });
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).genieEnabled).toBe(false);
  });

  it('is refused for anyone but a super admin', async () => {
    const { tenant } = await seedTenant({ genieEnabled: false });
    globalRole = 'USER';
    expect((await patch(tenant.id, { genieEnabled: true })).status).toBe(403);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).genieEnabled).toBe(false);
  });
});
