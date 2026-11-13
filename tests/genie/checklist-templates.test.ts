import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const who = { tenantId: '' };
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ ...who })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));

import { prisma } from '@/lib/prisma/client';
import { POST as CREATE } from '@/app/api/settings/checklist-templates/route';
import { PATCH as RENAME } from '@/app/api/settings/checklist-templates/[id]/route';
import { req, resetDb, seedTenant } from './helpers';

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Checklist templates', () => {
  it('accepts items as { label, position } objects (what the Settings page sends)', async () => {
    const { tenant } = await seedTenant();
    who.tenantId = tenant.id;
    const r = await CREATE(req('/x', { method: 'POST', body: { name: ' Wedding ', items: [{ label: 'Load printer', position: 0 }, { label: '  ', position: 1 }, { label: 'Test Wi-Fi', position: 2 }] } }));
    expect(r.status).toBe(201);
    const t = await r.json();
    expect(t.name).toBe('Wedding');
    expect(t.items.map((i: any) => [i.label, i.position])).toEqual([['Load printer', 0], ['Test Wi-Fi', 1]]);
  });

  it('still accepts plain strings, and rejects a missing name instead of crashing', async () => {
    const { tenant } = await seedTenant();
    who.tenantId = tenant.id;
    const r = await CREATE(req('/x', { method: 'POST', body: { name: 'Corporate', items: ['Backdrop', 'Props'] } }));
    expect((await r.json()).items.map((i: any) => i.label)).toEqual(['Backdrop', 'Props']);
    expect((await CREATE(req('/x', { method: 'POST', body: { items: [] } }))).status).toBe(400);
    const t = await prisma.checklistTemplate.findFirstOrThrow({ where: { tenantId: tenant.id } });
    expect((await RENAME(req('/x', { method: 'PATCH', body: {} }), { params: { id: t.id } })).status).toBe(400);
  });
});
