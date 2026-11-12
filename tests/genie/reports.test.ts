import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

const who = { userId: '', tenantId: '' as string | undefined, globalRole: 'USER' };
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ ...who })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
const sendEmail = vi.fn(async (..._a: unknown[]) => ({ success: true }));
vi.mock('@/lib/email/send', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('@/lib/storage/r2', () => ({
  headR2Object: vi.fn(async (key: string) => (key.includes('missing') ? null : { bytes: 1234 })),
  getPresignedUploadUrl: vi.fn(async () => 'https://r2.test/put'),
  getPresignedDownloadUrl: vi.fn(async (key: string) => 'https://r2.test/get/' + key),
}));

import { prisma } from '@/lib/prisma/client';
import { GET as MINE, POST as CREATE } from '@/app/api/reports/route';
import { GET as ADMIN_LIST } from '@/app/api/reports/admin/route';
import { GET as UNREAD } from '@/app/api/reports/unread/route';
import { GET as DETAIL, PATCH as TRIAGE } from '@/app/api/reports/[id]/route';
import { POST as NOTE } from '@/app/api/reports/[id]/notes/route';
import { GET as FILE } from '@/app/api/reports/[id]/files/[index]/route';
import { POST as UPLOAD_URL } from '@/app/api/reports/upload-url/route';
import { req, resetDb, seedTenant } from './helpers';

const TAG = '@reports-test.boothgen.test';
const p = (id: string) => ({ params: { id } });
const post = (body: unknown) => req('/x', { method: 'POST', body });

async function users() {
  const { tenant } = await seedTenant();
  const reporter = await prisma.user.create({ data: { email: randomUUID() + TAG, name: 'Ana Tester' } });
  const admin = await prisma.user.create({ data: { email: randomUUID() + TAG, name: 'G Admin', globalRole: 'SUPER_ADMIN' } });
  return { tenant, reporter, admin };
}
const as = (u: { id: string }, tenantId?: string, admin = false) => { who.userId = u.id; who.tenantId = tenantId; who.globalRole = admin ? 'SUPER_ADMIN' : 'USER'; };

beforeEach(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } });
  await resetDb();
  sendEmail.mockClear();
  process.env.SUPER_ADMIN_NOTIFY_EMAIL = 'g@boothgen.test';
});
afterAll(async () => { await prisma.user.deleteMany({ where: { email: { endsWith: TAG } } }); await resetDb(); await prisma.$disconnect(); });

const BUG = { type: 'bug', title: 'Print button does nothing', area: 'printing', severity: 'major', deviceInfo: 'iPad Air 5, Genie 1.0', details: 'Tapped Print, nothing printed.' };

describe('Bug reports and suggestions', () => {
  it('files a report with who / where captured, and tells the Super Admin', async () => {
    const { tenant, reporter } = await users();
    as(reporter, tenant.id);
    const r = await CREATE(req('/x', { method: 'POST', body: { ...BUG, pageUrl: 'https://boothgen.test/events', attachments: [{ key: `reports/${reporter.id}/a.png`, name: 'shot.png', contentType: 'image/png', bytes: 9 }] }, headers: { 'user-agent': 'TestBrowser/1.0' } }));
    expect(r.status).toBe(201);
    const { id, number } = await r.json();
    const saved = await prisma.feedbackReport.findUniqueOrThrow({ where: { id } });
    expect(saved).toMatchObject({ userId: reporter.id, tenantId: tenant.id, status: 'new', adminUnread: true, pageUrl: 'https://boothgen.test/events', userAgent: 'TestBrowser/1.0', severity: 'major' });
    expect(saved.appVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect((saved.attachments as any[])[0]).toMatchObject({ name: 'shot.png', bytes: 1234 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toBe('g@boothgen.test');
    expect(String(sendEmail.mock.calls[0][1])).toContain(`#${number}`);

    // Suggestions drop severity; attachments must be the user's own finished uploads
    expect((await CREATE(post({ ...BUG, type: 'suggestion', attachments: [] }))).status).toBe(201);
    expect(await prisma.feedbackReport.findFirst({ where: { type: 'suggestion' } })).toMatchObject({ severity: null });
    expect((await CREATE(post({ ...BUG, attachments: [{ key: 'reports/someone-else/a.png', name: 'x.png', contentType: 'image/png', bytes: 1 }] }))).status).toBe(400);
    expect((await CREATE(post({ ...BUG, attachments: [{ key: `reports/${reporter.id}/missing.png`, name: 'x.png', contentType: 'image/png', bytes: 1 }] }))).status).toBe(400);
    expect((await CREATE(post({ ...BUG, area: 'nowhere' }))).status).toBe(400);
    expect((await UPLOAD_URL(post({ contentType: 'application/zip', bytes: 10 }))).status).toBe(400);
    expect(await (await UPLOAD_URL(post({ contentType: 'video/mp4', bytes: 10 }))).json()).toMatchObject({ key: expect.stringMatching(new RegExp(`^reports/${reporter.id}/.+\\.mp4$`)) });

    // Signed out: refused
    who.userId = '';
    expect((await CREATE(post(BUG))).status).toBe(401);
  });

  it('Super Admin triages; the reporter sees status and visible notes (not internal ones) and can reply', async () => {
    const { tenant, reporter, admin } = await users();
    as(reporter, tenant.id);
    const { id } = await (await CREATE(post(BUG))).json();

    // Reporters can't use triage
    expect((await ADMIN_LIST(req('/x'))).status).toBe(403);
    expect((await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'fixed' } }), p(id))).status).toBe(403);

    as(admin, undefined, true);
    expect(await (await UNREAD()).json()).toMatchObject({ admin: 1 });
    const list = await (await ADMIN_LIST(req('/x?status=new&q=print'))).json();
    expect(list.reports.map((r: any) => r.id)).toEqual([id]);
    expect(list.counts).toEqual({ new: 1 });
    expect(list.tenants).toEqual([{ id: tenant.id, name: tenant.name }]);
    const d = await (await DETAIL(req('/x?admin=1'), p(id))).json();
    expect(d.report).toMatchObject({ reporter: { email: reporter.email }, tenant: { id: tenant.id }, appVersion: expect.any(String), pageUrl: null });
    expect((await prisma.feedbackReport.findUniqueOrThrow({ where: { id } })).adminUnread).toBe(false);

    sendEmail.mockClear();
    await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'need_info', priority: 'P1' } }), p(id));
    await NOTE(post({ body: 'Which printer model?', admin: true }), p(id));
    await NOTE(post({ body: 'Probably the DNP driver', admin: true, internal: true }), p(id));
    expect(sendEmail.mock.calls.map(c => c[0])).toEqual([reporter.email, reporter.email]); // status + visible note, not the internal one

    as(reporter, tenant.id);
    expect(await (await UNREAD()).json()).toMatchObject({ mine: 1, admin: 0 });
    const mine = await (await DETAIL(req('/x'), p(id))).json();
    expect(mine.report.status).toBe('need_info');
    expect(mine.report.priority).toBeUndefined();
    expect(mine.report.reporter).toBeUndefined();
    expect(mine.report.notes.map((n: any) => n.body)).toEqual(['Status changed to Need more info', 'Which printer model?']);
    expect(await (await UNREAD()).json()).toMatchObject({ mine: 0 });
    expect((await (await MINE()).json()).reports[0]).toMatchObject({ id, status: 'need_info', unread: false });

    sendEmail.mockClear();
    expect((await NOTE(post({ body: 'DNP DS620', internal: true }), p(id))).status).toBe(201);
    const after = await prisma.feedbackReport.findUniqueOrThrow({ where: { id }, include: { notes: { orderBy: { createdAt: 'asc' } } } });
    expect(after.adminUnread).toBe(true);
    expect(after.notes.at(-1)).toMatchObject({ body: 'DNP DS620', fromAdmin: false, internal: false }); // reporters can't post internal notes
    expect(sendEmail.mock.calls[0][0]).toBe('g@boothgen.test');

    as(admin, undefined, true);
    sendEmail.mockClear();
    const fixed = await (await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'fixed', fixedInVersion: '2.72.0' } }), p(id))).json();
    expect(fixed.report).toMatchObject({ status: 'fixed', fixedInVersion: '2.72.0', priority: 'P1' });
    expect(String(sendEmail.mock.calls[0][2])).toContain('2.72.0');
  });

  it('keeps reports and attachments private to the reporter and Super Admins', async () => {
    const { tenant, reporter, admin } = await users();
    as(reporter, tenant.id);
    const { id } = await (await CREATE(post({ ...BUG, attachments: [{ key: `reports/${reporter.id}/a.png`, name: 'shot.png', contentType: 'image/png', bytes: 9 }] }))).json();
    const res = await FILE(req('/x'), { params: { id, index: '0' } });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain(`reports/${reporter.id}/a.png`);

    const other = await prisma.user.create({ data: { email: randomUUID() + TAG, name: 'Someone Else' } });
    as(other, tenant.id);
    expect((await DETAIL(req('/x'), p(id))).status).toBe(404);
    expect((await DETAIL(req('/x?admin=1'), p(id))).status).toBe(404);
    expect((await NOTE(post({ body: 'hi' }), p(id))).status).toBe(404);
    expect((await FILE(req('/x'), { params: { id, index: '0' } })).status).toBe(404);
    expect((await (await MINE()).json()).reports).toEqual([]);

    as(admin, undefined, true);
    expect((await FILE(req('/x'), { params: { id, index: '0' } })).status).toBe(302);
    // A stale session token claiming Super Admin isn't enough
    as(other, tenant.id, true);
    expect((await ADMIN_LIST(req('/x'))).status).toBe(403);
  });
});
