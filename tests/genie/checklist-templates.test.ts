import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const who = { tenantId: '' };
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ ...who })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));

import { prisma } from '@/lib/prisma/client';
import { POST as CREATE } from '@/app/api/settings/checklist-templates/route';
import { PATCH as RENAME } from '@/app/api/settings/checklist-templates/[id]/route';
import { PUT as REORDER } from '@/app/api/settings/checklist-templates/[id]/items/route';
import { PATCH as EDIT_ITEM } from '@/app/api/settings/checklist-templates/[id]/items/[itemId]/route';
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
  it('reorders items when every item is listed once, and refuses partial or foreign lists', async () => {
    const { tenant } = await seedTenant();
    who.tenantId = tenant.id;
    const t = await (await CREATE(req('/x', { method: 'POST', body: { name: 'Setup', items: ['One', 'Two', 'Three'] } }))).json();
    const [one, two, three] = t.items.map((i: any) => i.id);
    const ok = await REORDER(req('/x', { method: 'PUT', body: { order: [three, one, two] } }), { params: { id: t.id } });
    expect(ok.status).toBe(200);
    const items = await prisma.checklistTemplateItem.findMany({ where: { templateId: t.id }, orderBy: { position: 'asc' } });
    expect(items.map(i => i.label)).toEqual(['Three', 'One', 'Two']);
    expect((await REORDER(req('/x', { method: 'PUT', body: { order: [one, two] } }), { params: { id: t.id } })).status).toBe(400);
    expect((await REORDER(req('/x', { method: 'PUT', body: { order: [one, two, 'other'] } }), { params: { id: t.id } })).status).toBe(400);

    // Another operator can't reorder this template
    const { tenant: other } = await seedTenant();
    who.tenantId = other.id;
    expect((await REORDER(req('/x', { method: 'PUT', body: { order: [one, two, three] } }), { params: { id: t.id } })).status).toBe(404);
  });

  it('edits an item label, and rejects an empty one instead of crashing', async () => {
    const { tenant } = await seedTenant();
    who.tenantId = tenant.id;
    const t = await (await CREATE(req('/x', { method: 'POST', body: { name: 'Setup', items: ['Chrage batteries'] } }))).json();
    const params = { params: { id: t.id, itemId: t.items[0].id } };
    const r = await EDIT_ITEM(req('/x', { method: 'PATCH', body: { label: ' Charge batteries ' } }), params);
    expect((await r.json()).label).toBe('Charge batteries');
    expect((await EDIT_ITEM(req('/x', { method: 'PATCH', body: {} }), params)).status).toBe(400);
    expect((await EDIT_ITEM(req('/x', { method: 'PATCH', body: { label: '  ' } }), params)).status).toBe(400);
  });
});
