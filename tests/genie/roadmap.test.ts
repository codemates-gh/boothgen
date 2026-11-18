import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

const who = { userId: '', tenantId: '' as string | undefined, globalRole: 'USER' };
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ ...who })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
const sendEmail = vi.fn(async (..._a: unknown[]) => ({ success: true }));
vi.mock('@/lib/email/send', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('@/lib/storage/r2', () => ({
  headR2Object: vi.fn(async () => ({ bytes: 1234 })),
  getPresignedUploadUrl: vi.fn(async () => 'https://r2.test/put'),
  getPresignedDownloadUrl: vi.fn(async (key: string) => 'https://r2.test/get/' + key),
}));

import { prisma } from '@/lib/prisma/client';
import { POST as CREATE_REPORT } from '@/app/api/reports/route';
import { GET as REPORT, PATCH as TRIAGE } from '@/app/api/reports/[id]/route';
import { GET as ADMIN_LIST, POST as ADMIN_CREATE } from '@/app/api/roadmap/admin/route';
import { GET as ADMIN_ITEM, PATCH as ADMIN_UPDATE, DELETE as ADMIN_DELETE } from '@/app/api/roadmap/admin/[id]/route';
import { GET as DEV_REPORTS } from '@/app/api/dev/reports/route';
import { GET as DEV_ROADMAP, POST as DEV_ROADMAP_ADD } from '@/app/api/dev/roadmap/route';
import { GET as DEV_ITEM, POST as DEV_ITEM_UPDATE } from '@/app/api/dev/roadmap/[id]/route';
import { req, resetDb, seedTenant } from './helpers';

const TAG = '@roadmap-test.boothgen.test';
const KEY = 'r'.repeat(40);
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const dev = (body?: unknown, key = KEY, path = '/x') => req(path, { body, headers: { authorization: 'Bearer ' + key } });
const as = (u: { id: string }, tenantId?: string, admin = false) => { who.userId = u.id; who.tenantId = tenantId; who.globalRole = admin ? 'SUPER_ADMIN' : 'USER'; };

async function clean() {
  await prisma.feedbackReport.deleteMany({ where: { user: { email: { endsWith: TAG } } } });
  await prisma.roadmapItem.deleteMany({ where: { id: { startsWith: 'rt-' } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } });
}

async function users() {
  const { tenant } = await seedTenant();
  const operator = await prisma.user.create({ data: { email: randomUUID() + TAG, name: 'Ana Operator' } });
  const admin = await prisma.user.create({ data: { email: randomUUID() + TAG, name: 'G Admin', globalRole: 'SUPER_ADMIN' } });
  return { tenant, operator, admin };
}

const item = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: 'Item ' + id, summary: 'One line about ' + id, area: 'genie_ipad', group: 'next_up', ...extra });

beforeEach(async () => {
  await clean(); await resetDb();
  sendEmail.mockClear();
  process.env.REPORTS_DEV_TOKEN = KEY;
});
afterAll(async () => { await clean(); await resetDb(); await prisma.$disconnect(); });

describe('Roadmap', () => {
  it('Super Admins only: create, edit, reorder within a group, change status and delete', async () => {
    const { tenant, operator, admin } = await users();
    as(operator, tenant.id);
    expect((await ADMIN_LIST()).status).toBe(403);
    expect((await ADMIN_CREATE(req('/x', { method: 'POST', body: item('rt-a') }))).status).toBe(403);

    as(admin, undefined, true);
    for (const id of ['rt-a', 'rt-b', 'rt-c']) expect((await ADMIN_CREATE(req('/x', { method: 'POST', body: item(id) }))).status).toBe(201);
    // Off for operators by default, and a one-line description only
    const a = await prisma.roadmapItem.findUniqueOrThrow({ where: { id: 'rt-a' } });
    expect(a).toMatchObject({ status: 'planned', group: 'next_up', visibleToOperators: false, sortOrder: 0 });
    expect((await ADMIN_CREATE(req('/x', { method: 'POST', body: item('rt-x', { summary: 'two\nlines' }) }))).status).toBe(400);
    expect((await ADMIN_CREATE(req('/x', { method: 'POST', body: item('rt-a') }))).status).toBe(400); // id taken

    const order = async () => (await (await ADMIN_LIST()).json()).items.filter((i: any) => i.id.startsWith('rt-')).map((i: any) => i.id);
    expect(await order()).toEqual(['rt-a', 'rt-b', 'rt-c']);
    await ADMIN_UPDATE(req('/x', { method: 'PATCH', body: { move: 'up' } }), p('rt-c'));
    expect(await order()).toEqual(['rt-a', 'rt-c', 'rt-b']);
    await ADMIN_UPDATE(req('/x', { method: 'PATCH', body: { position: { top: true } } }), p('rt-b'));
    expect(await order()).toEqual(['rt-b', 'rt-a', 'rt-c']);
    // Groups come in order Next up, Essential, Later; a new group puts the item at its end
    await ADMIN_UPDATE(req('/x', { method: 'PATCH', body: { group: 'later' } }), p('rt-b'));
    await ADMIN_CREATE(req('/x', { method: 'POST', body: item('rt-e', { group: 'essential' }) }));
    expect(await order()).toEqual(['rt-a', 'rt-c', 'rt-e', 'rt-b']);

    const r = await ADMIN_UPDATE(req('/x', { method: 'PATCH', body: { status: 'shipped', shippedVersion: '2.108.0', visibleToOperators: true, targetDate: '2027-01-15', planRef: 'docs/plan.md P11' } }), p('rt-a'));
    const shipped = (await r.json()).item;
    expect(shipped).toMatchObject({ status: 'shipped', shippedVersion: '2.108.0', visibleToOperators: true, targetDate: '2027-01-15', planRef: 'docs/plan.md P11' });
    expect(shipped.shippedAt).toBe(new Date().toISOString().slice(0, 10)); // stamped when shipped
    expect((await order()).at(-1)).toBe('rt-a'); // shipped ones last
    // Shipped items take no place in the order: the arrows skip them
    await ADMIN_UPDATE(req('/x', { method: 'PATCH', body: { move: 'down' } }), p('rt-c'));
    expect(await order()).toEqual(['rt-c', 'rt-e', 'rt-b', 'rt-a']);

    expect((await ADMIN_DELETE(req('/x', { method: 'DELETE' }), p('rt-c'))).status).toBe(200);
    expect(await prisma.roadmapItem.findUnique({ where: { id: 'rt-c' } })).toBeNull();
    expect((await ADMIN_UPDATE(req('/x', { method: 'PATCH', body: { status: 'testing' } }), p('rt-c'))).status).toBe(404);
  });

  it('links suggestions: On the roadmap, counted on the item, taken off Dev; bugs can\'t be linked', async () => {
    const { tenant, operator, admin } = await users();
    as(admin, undefined, true);
    await ADMIN_CREATE(req('/x', { method: 'POST', body: item('rt-gif', { title: 'Animated GIF' }) }));

    as(operator, tenant.id);
    const file = async (type: string) => (await (await CREATE_REPORT(req('/x', { method: 'POST', body: {
      type, title: type + ' about GIFs', area: 'genie_guest', details: 'Please add GIFs', attachments: [],
      ...(type === 'bug' ? { severity: 'minor' } : {}) } }))).json()).id as string;
    const suggestion = await file('suggestion');
    const bug = await file('bug');

    as(admin, undefined, true);
    const triage = (id: string, body: unknown) => TRIAGE(req('/x', { method: 'PATCH', body }), p(id));
    await triage(suggestion, { assignedToDev: true });
    expect((await triage(bug, { roadmapItemId: 'rt-gif' })).status).toBe(400);
    expect((await triage(suggestion, { roadmapItemId: 'rt-nope' })).status).toBe(400);
    expect((await triage(suggestion, { status: 'on_roadmap' })).status).toBe(400); // needs the item

    sendEmail.mockClear();
    const linked = (await (await triage(suggestion, { roadmapItemId: 'rt-gif' })).json()).report;
    expect(linked).toMatchObject({ status: 'on_roadmap', assignedToDev: false, roadmapItem: { id: 'rt-gif', title: 'Animated GIF' } });
    expect(sendEmail).toHaveBeenCalled(); // the reporter hears it's on the roadmap
    expect(String(sendEmail.mock.calls[0][2])).toContain('On the roadmap');

    const listed = (await (await ADMIN_LIST()).json()).items.find((i: any) => i.id === 'rt-gif');
    expect(listed.suggestionCount).toBe(1);
    const detail = await (await ADMIN_ITEM(req('/x'), p('rt-gif'))).json();
    expect(detail.suggestions).toMatchObject([{ id: suggestion, voteCount: 1, reporterName: 'Ana Operator' }]);

    // Unlinking (or deleting the item) puts the suggestion back to Confirmed
    expect((await (await triage(suggestion, { roadmapItemId: null })).json()).report).toMatchObject({ status: 'confirmed', roadmapItem: null });
    await triage(suggestion, { roadmapItemId: 'rt-gif' });
    await ADMIN_DELETE(req('/x', { method: 'DELETE' }), p('rt-gif'));
    expect(await prisma.feedbackReport.findUniqueOrThrow({ where: { id: suggestion } })).toMatchObject({ status: 'confirmed', roadmapItemId: null });
    expect((await (await REPORT(req('/x?admin=1'), p(suggestion))).json()).report.notes.at(-1).body).toContain('was removed');
  });

  it('the scheduled Dev job never picks up roadmap items or suggestions on the roadmap', async () => {
    const { tenant, operator, admin } = await users();
    as(admin, undefined, true);
    for (const id of ['rt-pose', 'rt-gif']) await ADMIN_CREATE(req('/x', { method: 'POST', body: item(id) }));
    as(operator, tenant.id);
    const suggestion = (await (await CREATE_REPORT(req('/x', { method: 'POST', body: { type: 'suggestion', title: 'GIFs please', area: 'genie_guest', details: 'Please add GIFs', attachments: [] } }))).json()).id;
    as(admin, undefined, true);
    await TRIAGE(req('/x', { method: 'PATCH', body: { assignedToDev: true } }), p(suggestion));
    expect((await (await DEV_REPORTS(dev())).json()).reports.map((r: any) => r.id)).toEqual([suggestion]);

    await TRIAGE(req('/x', { method: 'PATCH', body: { roadmapItemId: 'rt-gif' } }), p(suggestion));
    // Even if someone ticks Assign to Dev again, an On the roadmap suggestion stays out of the Dev list
    await prisma.feedbackReport.update({ where: { id: suggestion }, data: { assignedToDev: true } });
    for (const path of ['/x', '/x?all=1']) {
      const body = await (await DEV_REPORTS(dev(undefined, KEY, path))).json();
      const ids = body.reports.map((r: any) => r.id);
      expect(ids).not.toContain('rt-pose');
      expect(ids).not.toContain('rt-gif');
      expect(ids).not.toContain(suggestion);
      expect(JSON.stringify(body)).not.toMatch(/rt-(pose|gif)/);
    }
  });

  it('Dev roadmap API: key required; list, add, update status and move', async () => {
    delete process.env.REPORTS_DEV_TOKEN;
    expect((await DEV_ROADMAP(dev())).status).toBe(404);
    process.env.REPORTS_DEV_TOKEN = KEY;
    expect((await DEV_ROADMAP(dev(undefined, 'wrong'))).status).toBe(401);
    expect((await DEV_ROADMAP_ADD(req('/x', { body: item('rt-z') }))).status).toBe(401);

    expect((await DEV_ROADMAP_ADD(dev(item('rt-pose', { status: 'in_progress', planRef: 'docs/plan.md P11' })))).status).toBe(201);
    expect((await DEV_ROADMAP_ADD(dev(item('rt-share')))).status).toBe(201);
    // Without an id, one is made from the title
    const made = (await (await DEV_ROADMAP_ADD(dev({ title: 'Rt Confession booth (video)', summary: 'Video messages', area: 'genie_ipad', group: 'next_up', position: { after: 'rt-pose' } }))).json()).item;
    expect(made.id).toBe('rt-confession-booth-video');
    expect((await DEV_ROADMAP_ADD(dev(item('rt-bad', { area: 'mars' })))).status).toBe(400);

    const ids = async (q = '') => (await (await DEV_ROADMAP(dev(undefined, KEY, '/x' + q))).json()).items.filter((i: any) => i.id.startsWith('rt-')).map((i: any) => i.id);
    expect(await ids()).toEqual(['rt-pose', 'rt-confession-booth-video', 'rt-share']);
    expect(await ids('?status=in_progress')).toEqual(['rt-pose']);
    expect((await DEV_ROADMAP(dev(undefined, KEY, '/x?status=nope'))).status).toBe(400);

    await DEV_ITEM_UPDATE(dev({ position: { before: 'rt-pose' } }), p('rt-share'));
    expect(await ids()).toEqual(['rt-share', 'rt-pose', 'rt-confession-booth-video']);
    expect((await DEV_ITEM_UPDATE(dev({ position: { after: 'rt-missing' } }), p('rt-share'))).status).toBe(400);

    const done = (await (await DEV_ITEM_UPDATE(dev({ status: 'shipped', shippedVersion: '2.110.0', shippedAt: '2026-11-20' }), p('rt-pose'))).json()).item;
    expect(done).toMatchObject({ status: 'shipped', shippedAt: '2026-11-20', shippedVersion: '2.110.0' });
    expect((await (await DEV_ITEM(dev(), p('rt-pose'))).json())).toMatchObject({ item: { id: 'rt-pose' }, suggestions: [] });
    expect((await DEV_ITEM(dev(), p('rt-missing'))).status).toBe(404);
  });
});
