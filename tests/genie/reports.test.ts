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
import { GET as BOARD, POST as CREATE } from '@/app/api/reports/route';
import { GET as SIMILAR } from '@/app/api/reports/similar/route';
import { POST as VOTE, DELETE as UNVOTE } from '@/app/api/reports/[id]/vote/route';
import { DELETE as UNFOLLOW } from '@/app/api/reports/[id]/follow/route';
import { GET as ADMIN_LIST } from '@/app/api/reports/admin/route';
import { GET as UNREAD } from '@/app/api/reports/unread/route';
import { GET as DETAIL, PATCH as TRIAGE } from '@/app/api/reports/[id]/route';
import { POST as NOTE } from '@/app/api/reports/[id]/notes/route';
import { GET as FILE } from '@/app/api/reports/[id]/files/[index]/route';
import { POST as UPLOAD_URL } from '@/app/api/reports/upload-url/route';
import { GET as DEV_LIST } from '@/app/api/dev/reports/route';
import { POST as DEV_UPLOAD } from '@/app/api/dev/reports/upload-url/route';
import { GET as NOTE_FILE } from '@/app/api/reports/[id]/notes/[noteId]/files/[index]/route';
import { GET as DEV_SHOW, POST as DEV_UPDATE } from '@/app/api/dev/reports/[id]/route';
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
    expect(mine.report.priority).toBe('P1');
    expect(mine.report.reporter).toBeUndefined();
    expect(mine.report.notes.map((n: any) => n.body)).toEqual(['Status changed to Need more info', 'Which printer model?']);
    expect(await (await UNREAD()).json()).toMatchObject({ mine: 0 });
    expect((await (await BOARD(req('/x?mine=1'))).json()).reports[0]).toMatchObject({ id, status: 'need_info', unread: false, isMine: true });

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

  it('everyone sees every report, but only by name; email, account, page and internal notes stay with Super Admins', async () => {
    const { tenant, reporter, admin } = await users();
    as(reporter, tenant.id);
    const { id } = await (await CREATE(post({ ...BUG, attachments: [{ key: `reports/${reporter.id}/a.png`, name: 'shot.png', contentType: 'image/png', bytes: 9 }] }))).json();
    as(admin, undefined, true);
    await NOTE(post({ body: 'Probably the DNP driver', admin: true, internal: true }), p(id));

    const other = await prisma.user.create({ data: { email: randomUUID() + TAG, name: 'Someone Else' } });
    const { tenant: otherTenant } = await seedTenant();
    as(other, otherTenant.id);
    const board = await (await BOARD(req('/x'))).json();
    expect(board.reports.map((r: any) => r.id)).toEqual([id]);
    expect(board.reports[0]).toMatchObject({ reporterName: 'Ana Tester', isMine: false, voteCount: 1, canVote: true });
    const d = (await (await DETAIL(req('/x'), p(id))).json()).report;
    expect(d).toMatchObject({ reporterName: 'Ana Tester', canReply: false });
    for (const k of ['reporter', 'tenant', 'pageUrl', 'userAgent', 'followers']) expect(d[k]).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain(reporter.email);
    expect(d.notes).toEqual([]);
    expect((await DETAIL(req('/x?admin=1'), p(id))).status).toBe(200); // not a Super Admin: plain view
    expect((await DETAIL(req('/x?admin=1'), p(id))).json().then(x => x.report.reporter)).resolves.toBeUndefined();
    expect((await FILE(req('/x'), { params: { id, index: '0' } })).status).toBe(302);
    expect((await NOTE(post({ body: 'me too' }), p(id))).status).toBe(403); // join first

    // Closed reports leave the default (open) board
    as(admin, undefined, true);
    await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'wont_fix' } }), p(id));
    as(other, otherTenant.id);
    expect((await (await BOARD(req('/x'))).json()).reports).toEqual([]);
    expect((await (await BOARD(req('/x?status=all'))).json()).reports).toHaveLength(1);

    // A stale session token claiming Super Admin isn't enough
    as(other, otherTenant.id, true);
    expect((await ADMIN_LIST(req('/x'))).status).toBe(403);
    who.userId = '';
    expect((await BOARD(req('/x'))).status).toBe(401);
  });

  it('suggests matching reports; "This is my issue too" follows them and gets the updates', async () => {
    const { tenant, reporter, admin } = await users();
    as(reporter, tenant.id);
    const { id } = await (await CREATE(post(BUG))).json();
    const follower = await prisma.user.create({ data: { email: randomUUID() + TAG, name: '' } });
    as(follower, tenant.id);
    const sim = await (await SIMILAR(req('/x?q=' + encodeURIComponent('print button broken')))).json();
    expect(sim.reports.map((r: any) => r.id)).toEqual([id]);
    expect((await (await SIMILAR(req('/x?q=the%20and'))).json()).reports).toEqual([]);
    expect(await (await VOTE(req('/x', { method: 'POST' }), p(id))).json()).toMatchObject({ voteCount: 2 });
    expect(await (await VOTE(req('/x', { method: 'POST' }), p(id))).json()).toMatchObject({ voteCount: 2 }); // once
    expect((await (await BOARD(req('/x?mine=1'))).json()).reports[0]).toMatchObject({ id, hasVoted: true, isFollowing: true, voteCount: 2 });

    // Follower replies: Booth Genius and the reporter hear about it; the follower shows as "a tester"
    sendEmail.mockClear();
    expect((await NOTE(post({ body: 'Same on my iPad' }), p(id))).status).toBe(201);
    expect(sendEmail.mock.calls.map(c => c[0]).sort()).toEqual([reporter.email, 'g@boothgen.test'].sort());
    as(reporter, tenant.id);
    const seen = (await (await DETAIL(req('/x'), p(id))).json()).report;
    expect(seen.notes.at(-1)).toMatchObject({ author: 'a tester', body: 'Same on my iPad' });

    // Status change reaches the reporter and the follower
    as(admin, undefined, true);
    sendEmail.mockClear();
    await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'confirmed' } }), p(id));
    expect(sendEmail.mock.calls.map(c => c[0]).sort()).toEqual([reporter.email, follower.email].sort());
    as(follower, tenant.id);
    expect(await (await UNREAD()).json()).toMatchObject({ mine: 1 });
    await DETAIL(req('/x'), p(id));
    expect(await (await UNREAD()).json()).toMatchObject({ mine: 0 });
  });

  it('"Already exists" needs how to find it and tells everyone the steps and link', async () => {
    const { tenant, reporter, admin } = await users();
    as(reporter, tenant.id);
    const { id } = await (await CREATE(post({ ...BUG, type: 'suggestion', title: 'Let guests get texts' }))).json();
    as(admin, undefined, true);
    expect((await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'exists' } }), p(id))).status).toBe(400);
    expect((await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'exists', howToFind: 'Genie → Sharing', howToFindUrl: 'javascript:alert(1)' } }), p(id))).status).toBe(400);
    sendEmail.mockClear();
    const r = await (await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'exists', howToFind: 'Genie → Sharing', howToFindUrl: '/genie/sharing' } }), p(id))).json();
    expect(r.report).toMatchObject({ status: 'exists', howToFind: 'Genie → Sharing', howToFindUrl: '/genie/sharing' });
    const html = String(sendEmail.mock.calls[0][2]);
    expect(html).toContain('Genie → Sharing');
    expect(html).toContain('https://boothgen.test/genie/sharing');
    expect((await (await ADMIN_LIST(req('/x'))).json()).counts).toEqual({ exists: 1 });
    as(reporter, tenant.id);
    expect((await (await DETAIL(req('/x'), p(id))).json()).report).toMatchObject({ status: 'exists', howToFind: 'Genie → Sharing' });
    // Leaving the status clears it
    as(admin, undefined, true);
    expect((await (await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'confirmed', howToFind: null, howToFindUrl: null } }), p(id))).json()).report).toMatchObject({ howToFind: null });
  });

  it('Duplicate links to the original and moves the reporter and followers there', async () => {
    const { tenant, reporter, admin } = await users();
    as(reporter, tenant.id);
    const orig = await (await CREATE(post(BUG))).json();
    const second = await prisma.user.create({ data: { email: randomUUID() + TAG, name: 'Bo' } });
    const fan = await prisma.user.create({ data: { email: randomUUID() + TAG, name: 'Cy' } });
    as(second, tenant.id);
    const dup = await (await CREATE(post({ ...BUG, title: 'Printing broken' }))).json();
    as(fan, tenant.id);
    await VOTE(req('/x', { method: 'POST' }), p(dup.id));

    as(admin, undefined, true);
    expect((await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'duplicate' } }), p(dup.id))).status).toBe(400);
    expect((await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'duplicate', duplicateOf: dup.number } }), p(dup.id))).status).toBe(400);
    sendEmail.mockClear();
    const r = await (await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'duplicate', duplicateOf: orig.number } }), p(dup.id))).json();
    expect(r.report.duplicateOf).toMatchObject({ id: orig.id, number: orig.number });
    expect(sendEmail.mock.calls.map(c => c[0]).sort()).toEqual([second.email, fan.email].sort());
    const followers = await prisma.feedbackFollower.findMany({ where: { reportId: orig.id }, select: { userId: true } });
    expect(followers.map(f => f.userId).sort()).toEqual([second.id, fan.id].sort());
    // Following a duplicate joins the original
    const late = await prisma.user.create({ data: { email: randomUUID() + TAG, name: 'Di' } });
    as(late, tenant.id);
    expect(await (await VOTE(req('/x', { method: 'POST' }), p(dup.id))).json()).toMatchObject({ reportId: orig.id, voteCount: 4 });
  });

  it('votes on suggestions: once per person, toggle, follow separately, sorted by most votes, closed keeps the count', async () => {
    const { tenant, reporter, admin } = await users();
    as(reporter, tenant.id);
    const a = await (await CREATE(post({ ...BUG, type: 'suggestion', title: 'Filters before countdown' }))).json();
    const b = await (await CREATE(post({ ...BUG, type: 'suggestion', title: 'Boomerang mode' }))).json();
    expect(await (await VOTE(req('/x', { method: 'POST' }), p(a.id))).json()).toMatchObject({ voteCount: 1 }); // own vote counts already
    const voters = await Promise.all([1, 2].map(() => prisma.user.create({ data: { email: randomUUID() + TAG, name: 'Voter' } })));
    for (const v of voters) { as(v, tenant.id); await VOTE(req('/x', { method: 'POST' }), p(b.id)); }
    as(voters[0], tenant.id);
    const board = await (await BOARD(req('/x?type=suggestion'))).json();
    expect(board.sort).toBe('votes');
    expect(board.reports.map((r: any) => [r.id, r.voteCount])).toEqual([[b.id, 3], [a.id, 1]]);

    // Stop emails but keep the vote; then take the vote back
    await UNFOLLOW(req('/x', { method: 'DELETE' }), p(b.id));
    let d = (await (await DETAIL(req('/x'), p(b.id))).json()).report;
    expect(d).toMatchObject({ voteCount: 3, hasVoted: true, isFollowing: false });
    as(admin, undefined, true);
    sendEmail.mockClear();
    await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'confirmed' } }), p(b.id));
    expect(sendEmail.mock.calls.map(c => c[0]).sort()).toEqual([reporter.email, voters[1].email].sort());
    expect((await (await ADMIN_LIST(req('/x?sort=votes'))).json()).reports.map((r: any) => r.voteCount)).toEqual([3, 1]);
    as(voters[0], tenant.id);
    expect(await (await UNVOTE(req('/x', { method: 'DELETE' }), p(b.id))).json()).toMatchObject({ voteCount: 2 });

    // Closed: count stays, no new votes or vote changes
    as(admin, undefined, true);
    await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'wont_fix' } }), p(b.id));
    as(voters[0], tenant.id);
    expect((await VOTE(req('/x', { method: 'POST' }), p(b.id))).status).toBe(400);
    expect((await UNVOTE(req('/x', { method: 'DELETE' }), p(b.id))).status).toBe(400);
    d = (await (await DETAIL(req('/x'), p(b.id))).json()).report;
    expect(d).toMatchObject({ voteCount: 2, canVote: false });
  });

  it('Duplicate moves votes to the original without counting anyone twice', async () => {
    const { tenant, reporter, admin } = await users();
    as(reporter, tenant.id);
    const orig = await (await CREATE(post({ ...BUG, type: 'suggestion', title: 'Dark mode' }))).json();
    const [x, y] = await Promise.all([1, 2].map(() => prisma.user.create({ data: { email: randomUUID() + TAG, name: 'V' } })));
    as(x, tenant.id);
    const dup = await (await CREATE(post({ ...BUG, type: 'suggestion', title: 'Night theme' }))).json();
    await VOTE(req('/x', { method: 'POST' }), p(orig.id)); // x voted on both
    as(y, tenant.id);
    await VOTE(req('/x', { method: 'POST' }), p(dup.id));
    as(reporter, tenant.id);
    await VOTE(req('/x', { method: 'POST' }), p(dup.id)); // the original's reporter voted on the duplicate too

    as(admin, undefined, true);
    await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'duplicate', duplicateOf: orig.number } }), p(dup.id));
    const o = (await (await DETAIL(req('/x?admin=1'), p(orig.id))).json()).report;
    expect(o.voteCount).toBe(3); // reporter + x + y
    expect((await (await DETAIL(req('/x?admin=1'), p(dup.id))).json()).report.voteCount).toBe(1);
  });

  it('Assign to Dev: the Dev API needs its key, lists assigned reports without emails, and updates like triage', async () => {
    const { tenant, reporter, admin } = await users();
    as(reporter, tenant.id);
    const { id, number } = await (await CREATE(post({ ...BUG, attachments: [{ key: `reports/${reporter.id}/a.png`, name: 'shot.png', contentType: 'image/png', bytes: 9 }] }))).json();
    const KEY = 'k'.repeat(40);
    const dev = (path: string, body?: unknown, key = KEY) => req(path, { body, headers: { authorization: 'Bearer ' + key } });

    delete process.env.REPORTS_DEV_TOKEN;
    expect((await DEV_LIST(dev('/x'))).status).toBe(404); // off without a key
    process.env.REPORTS_DEV_TOKEN = KEY;
    expect((await DEV_LIST(dev('/x', undefined, 'wrong'))).status).toBe(401);
    expect((await DEV_LIST(req('/x'))).status).toBe(401);
    expect((await (await DEV_LIST(dev('/x'))).json()).reports).toEqual([]);

    as(admin, undefined, true);
    expect((await (await TRIAGE(req('/x', { method: 'PATCH', body: { assignedToDev: true } }), p(id))).json()).report.assignedToDev).toBe(true);
    expect((await (await ADMIN_LIST(req('/x?dev=1'))).json()).reports.map((r: any) => r.id)).toEqual([id]);

    const list = await (await DEV_LIST(dev('/x'))).json();
    expect(list.reports).toHaveLength(1);
    const r = list.reports[0];
    expect(r).toMatchObject({ number, title: BUG.title, details: BUG.details, assignedToDev: true, reporter: { name: 'Ana Tester' }, userAgent: null });
    expect(r.attachments[0].url).toContain(`reports/${reporter.id}/a.png`);
    expect(JSON.stringify(r)).not.toContain(reporter.email);
    expect((await DEV_SHOW(dev('/x'), p('#' + number))).status).toBe(200);

    sendEmail.mockClear();
    // Only staff mark a report Fixed; the Dev API stops at Fix ready
    const refused = await DEV_UPDATE(dev('/x', { status: 'fixed', fixedInVersion: '2.74.0' }), p(String(number)));
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toMatch(/Only Booth Genius staff can mark a report Fixed/);
    expect(sendEmail).not.toHaveBeenCalled();
    const up = await (await DEV_UPDATE(dev('/x', { status: 'fix_ready', fixedInVersion: '2.74.0', note: 'Print now retries when the printer wakes up.' }), p(String(number)))).json();
    expect(up.report).toMatchObject({ status: 'fix_ready', fixedInVersion: '2.74.0' });
    expect(up.report.notes.slice(-2).map((n: any) => [n.author, n.body])).toEqual([['Dev', 'Fix is live in version 2.74.0, being checked'], ['Dev', 'Print now retries when the printer wakes up.']]);
    expect(sendEmail.mock.calls.map(c => c[0])).toEqual([reporter.email, reporter.email]);
    expect(sendEmail.mock.calls[0][1]).toBe(`Report #${number}: the fix is live, being checked`);
    expect(sendEmail.mock.calls[0][2]).toContain('Fix is live, being checked</strong> (version 2.74.0)');
    expect((await (await DEV_LIST(dev('/x'))).json()).reports).toEqual([]); // waiting on staff, off Dev's queue
    expect((await (await ADMIN_LIST(req('/x?status=fix_ready'))).json()).counts.fix_ready).toBe(1);

    // Staff close it (the version is already there)
    sendEmail.mockClear();
    as(admin, undefined, true);
    const closed = await (await TRIAGE(req('/x', { method: 'PATCH', body: { status: 'fixed', fixedInVersion: '2.74.0' } }), p(id))).json();
    expect(closed.report).toMatchObject({ status: 'fixed', fixedInVersion: '2.74.0' });
    expect(closed.report.notes.at(-1).body).toBe('Status changed to Fixed (version 2.74.0)');
    expect(sendEmail.mock.calls.map(c => c[0])).toEqual([reporter.email]);
    as(reporter, tenant.id);
    expect((await (await DETAIL(req('/x'), p(id))).json()).report.notes.at(-1)).toMatchObject({ author: 'Booth Genius', fromAdmin: true });
    expect((await (await DEV_LIST(dev('/x'))).json()).reports).toEqual([]); // closed drops off the queue
    expect((await (await DEV_LIST(dev('/x?all=1'))).json()).reports).toHaveLength(1);
    expect((await DEV_UPDATE(dev('/x', { status: 'exists' }), p(id))).status).toBe(400);
    delete process.env.REPORTS_DEV_TOKEN;
  });

  it('screenshots on replies and notes; internal notes keep theirs private', async () => {
    const { tenant, reporter, admin } = await users();
    as(reporter, tenant.id);
    const { id } = await (await CREATE(post(BUG))).json();
    const shot = (owner: string, name = 'shot.png') => ({ key: `reports/${owner}/${name}`, name, contentType: 'image/png', bytes: 5 });

    expect((await NOTE(post({ body: 'Here it is', attachments: [shot('someone-else')] }), p(id))).status).toBe(400);
    const replied = await (await NOTE(post({ body: 'Here it is', attachments: [shot(reporter.id)] }), p(id))).json();
    const reply = replied.report.notes.at(-1);
    expect(reply.attachments).toEqual([expect.objectContaining({ name: 'shot.png', bytes: 1234, url: `/api/reports/${id}/notes/${reply.id}/files/0` })]);

    as(admin, undefined, true);
    const withInternal = await (await NOTE(post({ body: 'Log from the device', admin: true, internal: true, attachments: [shot(admin.id, 'log.png')] }), p(id))).json();
    const internalNote = withInternal.report.notes.at(-1);
    expect((await NOTE_FILE(req('/x'), { params: { id, noteId: internalNote.id, index: '0' } })).status).toBe(302);

    const other = await prisma.user.create({ data: { email: randomUUID() + TAG, name: 'Other' } });
    as(other, tenant.id);
    expect((await NOTE_FILE(req('/x'), { params: { id, noteId: reply.id, index: '0' } })).status).toBe(302);
    expect((await NOTE_FILE(req('/x'), { params: { id, noteId: internalNote.id, index: '0' } })).status).toBe(404);
    expect((await NOTE_FILE(req('/x'), { params: { id: 'wrong', noteId: reply.id, index: '0' } })).status).toBe(404);

    // Dev notes can carry screenshots too (uploaded under reports/dev/)
    process.env.REPORTS_DEV_TOKEN = 'k'.repeat(40);
    const dev = (body: unknown) => req('/x', { body, headers: { authorization: 'Bearer ' + 'k'.repeat(40) } });
    expect(await (await DEV_UPLOAD(dev({ contentType: 'image/png', bytes: 10 }))).json()).toMatchObject({ key: expect.stringMatching(/^reports\/dev\/.+\.png$/) });
    expect((await DEV_UPDATE(dev({ attachments: [shot('dev')] }), p(id))).status).toBe(400); // needs a note
    expect((await DEV_UPDATE(dev({ note: 'x', attachments: [shot(reporter.id)] }), p(id))).status).toBe(400); // not a Dev upload
    const fixed = await (await DEV_UPDATE(dev({ status: 'fix_ready', fixedInVersion: '2.74.0', note: 'Fixed screen attached', attachments: [shot('dev', 'after.png')] }), p(id))).json();
    expect(fixed.report.notes.at(-1)).toMatchObject({ body: 'Fixed screen attached', attachments: [expect.objectContaining({ name: 'after.png', url: expect.stringContaining('reports/dev/after.png') })] });
    delete process.env.REPORTS_DEV_TOKEN;
  });
});
