import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Genie uploads from the review screen (2.122.0): the guest cancels (delete the session) or changes a photo (delete the
// replaced file). Both come through the iPad's outbox: late, and possibly more than once.

vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));
const objects = new Map<string, number>();
const deleted: string[] = [];
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  getPresignedUploadUrl: vi.fn(async (key: string) => 'https://r2.test/upload/' + key),
  headR2Object: vi.fn(async (key: string) => (objects.has(key) ? { bytes: objects.get(key)! } : null)),
  deleteFromR2: vi.fn(async (key: string) => { deleted.push(key); objects.delete(key); }),
  r2PublicUrl: (key: string) => 'https://media.boothgen.test/' + key,
  r2KeyForPublicUrl: (url: string) => (url.startsWith('https://media.boothgen.test/') ? url.slice('https://media.boothgen.test/'.length) : null),
}));

import { prisma } from '@/lib/prisma/client';
import { POST as uploadUrl } from '@/app/api/genie/events/[eventId]/upload-url/route';
import { POST as registerAsset } from '@/app/api/genie/events/[eventId]/assets/route';
import { DELETE as deleteAsset } from '@/app/api/genie/events/[eventId]/assets/[clientId]/route';
import { DELETE as deleteSession } from '@/app/api/genie/events/[eventId]/sessions/[sessionId]/route';
import { POST as createShare } from '@/app/api/genie/events/[eventId]/shares/route';
import { GET as sessionPage } from '@/app/api/g/[token]/s/[sessionToken]/route';
import { galleryReplaced } from '@/lib/genie/ai/late';
import { guestSession, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const at = (eventId: string) => ({ params: Promise.resolve({ eventId }) });

async function setup() {
  const { tenant, client } = await seedTenant({ messaging: true });
  const event = await seedEvent(tenant.id, client.id);
  const { token } = await seedDevice(tenant.id);
  return { tenant, event, token };
}

type Ctx = Awaited<ReturnType<typeof setup>>;
async function upload(c: Ctx, session: ReturnType<typeof guestSession>, kind: string, extra: Record<string, unknown> = {}) {
  const clientId = randomUUID();
  const u = await uploadUrl(req('/x', { token: c.token, body: { clientId, fileName: kind + '.jpg', contentType: 'image/jpeg', bytes: 1000 } }), at(c.event.id));
  const { storageKey } = await u.json();
  objects.set(storageKey, 1000);
  const res = await registerAsset(req('/x', { token: c.token, body: { clientId, session, kind, fileName: kind + '.jpg', contentType: 'image/jpeg', bytes: 1000, width: 1200, height: 1800,
    sha256: 'a'.repeat(64), capturedAt: '2026-12-12T23:41:10Z', storageKey, ...extra } }), at(c.event.id));
  return { res, clientId, storageKey };
}
const delSession = (c: Ctx, sessionId: string, eventId = c.event.id) =>
  deleteSession(req('/x', { method: 'DELETE', token: c.token }), { params: Promise.resolve({ eventId, sessionId }) });
const delAsset = (c: Ctx, clientId: string) =>
  deleteAsset(req('/x', { method: 'DELETE', token: c.token }), { params: Promise.resolve({ eventId: c.event.id, clientId }) });

beforeEach(async () => { await resetDb(); objects.clear(); deleted.length = 0; });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('DELETE session (the guest cancelled on review)', () => {
  it('removes every file, Geniefied image and unsent share; the guest page is gone; repeats answer zeros', async () => {
    const c = await setup();
    const session = guestSession();
    const shot = await upload(c, session, 'shot', { shotIndex: 0 });
    const first = await upload(c, session, 'gallery');
    const second = await upload(c, session, 'gallery'); // the first becomes gallerySuperseded
    expect(second.res.status).toBe(201);
    const s = await prisma.genieSession.findUniqueOrThrow({ where: { clientId: session.id } });
    await prisma.genieShare.create({ data: { tenantId: c.tenant.id, eventId: c.event.id, sessionId: s.id, clientId: randomUUID(), channel: 'email', destination: 'a@b.co', requestedAt: new Date() } });
    await prisma.genieShare.create({ data: { tenantId: c.tenant.id, eventId: c.event.id, sessionId: s.id, clientId: randomUUID(), channel: 'email', destination: 'c@d.co', status: 'sent', requestedAt: new Date() } });
    // A Geniefied render of the shot: its input is the shot's own object
    await prisma.genieAiRender.create({ data: { tenantId: c.tenant.id, eventId: c.event.id, sessionClientId: session.id, shotIndex: 0, themeId: 't', idempotencyKey: session.id + ':0:t',
      status: 'done', inputKey: shot.storageKey, resultKey: 'ai/result.jpg', consentAcceptedAt: new Date(), consentTextSha256: 'b'.repeat(64) } });

    const res = await delSession(c, session.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: session.id, assetsDeleted: 3, sharesCancelled: 1 });
    expect(await prisma.galleryAsset.count({ where: { genieSessionId: s.id } })).toBe(0);
    expect(deleted).toEqual(expect.arrayContaining([shot.storageKey, first.storageKey, second.storageKey, 'ai/result.jpg']));
    const render = await prisma.genieAiRender.findFirstOrThrow({ where: { sessionClientId: session.id } });
    expect(render).toMatchObject({ resultKey: null, inputKey: '', counted: true });
    expect((await prisma.genieShare.findMany({ where: { sessionId: s.id }, orderBy: { destination: 'asc' } })).map(x => x.status)).toEqual(['cancelled', 'sent']);
    expect((await prisma.genieSession.findUniqueOrThrow({ where: { id: s.id } })).deletedAt).not.toBeNull();

    const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId: c.event.id } });
    expect((await sessionPage(req('/x'), { params: Promise.resolve({ token: gallery.clientToken!, sessionToken: session.publicToken }) })).status).toBe(404);

    const again = await delSession(c, session.id);
    expect(await again.json()).toEqual({ sessionId: session.id, assetsDeleted: 0, sharesCancelled: 0 });
  });

  it('tombstone: an upload or share still in the outbox gets 410, and its uploaded file is removed', async () => {
    const c = await setup();
    const session = guestSession();
    await upload(c, session, 'shot', { shotIndex: 0 });
    await delSession(c, session.id);
    const late = await upload(c, session, 'gallery');
    expect(late.res.status).toBe(410);
    expect((await late.res.json()).code).toBe('session_deleted');
    expect(deleted).toContain(late.storageKey);
    const share = await createShare(req('/x', { token: c.token, body: { id: randomUUID(), session, channel: 'email', destination: 'a@b.co', createdAt: '2026-12-12T23:42:10Z' } }), at(c.event.id));
    expect(share.status).toBe(410);
  });

  it('a cancel that arrives before any upload still blocks the uploads (unknown session = 200 with zeros)', async () => {
    const c = await setup();
    const session = guestSession();
    const res = await delSession(c, session.id);
    expect(await res.json()).toEqual({ sessionId: session.id, assetsDeleted: 0, sharesCancelled: 0 });
    expect((await upload(c, session, 'gallery')).res.status).toBe(410);
  });

  it('422 session_conflict for another event’s session; 404 for an event of another account', async () => {
    const c = await setup();
    const other = await seedEvent(c.tenant.id, (await prisma.client.findFirstOrThrow({ where: { tenantId: c.tenant.id } })).id);
    const session = guestSession();
    await upload(c, session, 'gallery');
    const res = await delSession(c, session.id, other.id);
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('session_conflict');
    expect(await prisma.galleryAsset.count()).toBe(1);
    const stranger = await setup();
    expect((await deleteSession(req('/x', { method: 'DELETE', token: stranger.token }), { params: Promise.resolve({ eventId: c.event.id, sessionId: session.id }) })).status).toBe(404);
  });
});

describe('DELETE asset (a file replaced on review)', () => {
  it('deletes the replaced file; repeats and unknown ids answer deleted: false', async () => {
    const c = await setup();
    const session = guestSession();
    const old = await upload(c, session, 'shot', { shotIndex: 0 });
    await upload(c, session, 'shot', { shotIndex: 0 });
    const r = await delAsset(c, old.clientId);
    expect(await r.json()).toEqual({ clientId: old.clientId, deleted: true });
    expect(deleted).toContain(old.storageKey);
    expect(await prisma.galleryAsset.count({ where: { genieKind: 'shot' } })).toBe(1);
    expect(await (await delAsset(c, old.clientId)).json()).toEqual({ clientId: old.clientId, deleted: false });
    expect(await (await delAsset(c, randomUUID())).json()).toMatchObject({ deleted: false });
  });

  it('never deletes a manually uploaded photo', async () => {
    const c = await setup();
    await upload(c, guestSession(), 'gallery');
    const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId: c.event.id } });
    const clientId = randomUUID();
    await prisma.galleryAsset.create({ data: { galleryId: gallery.id, clientId, assetType: 'PHOTO', url: 'https://media.boothgen.test/manual.jpg', filename: 'manual.jpg', fileSizeBytes: 10, mimeType: 'image/jpeg', approvalStatus: 'APPROVED' } });
    expect(await (await delAsset(c, clientId)).json()).toMatchObject({ deleted: false });
    expect(await prisma.galleryAsset.count({ where: { clientId } })).toBe(1);
  });

  it('deleting the current gallery copy brings the newest earlier one back as the cover', async () => {
    const c = await setup();
    const session = guestSession();
    await upload(c, session, 'gallery');
    const middle = await upload(c, session, 'gallery');
    const current = await upload(c, session, 'gallery');
    await delAsset(c, current.clientId);
    const covers = await prisma.galleryAsset.findMany({ where: { genieKind: 'gallery' } });
    expect(covers.map(a => a.clientId)).toEqual([middle.clientId]);
    expect(await prisma.galleryAsset.count({ where: { genieKind: 'gallerySuperseded' } })).toBe(1);
  });

  it('a replaced boomerang poster: the clip takes the newer poster', async () => {
    const c = await setup();
    const session = guestSession();
    await upload(c, session, 'boomerang', { contentType: 'video/mp4', durationMs: 3000 });
    const oldPoster = await upload(c, session, 'boomerangPoster');
    const newPoster = await upload(c, session, 'boomerangPoster');
    await delAsset(c, oldPoster.clientId);
    const clip = await prisma.galleryAsset.findFirstOrThrow({ where: { genieKind: 'boomerang' } });
    expect(clip.thumbnailUrl).toBe('https://media.boothgen.test/' + newPoster.storageKey);
  });
});

describe('galleryReplaced and the “Geniefied photo is ready” message', () => {
  it('only for a session with Geniefied images, never for a plain change on an AI event', async () => {
    const c = await setup();
    await prisma.eventGenieSettings.update({ where: { eventId: c.event.id }, data: { aiEnabled: true } });
    const session = guestSession();
    await upload(c, session, 'gallery');
    const s = await prisma.genieSession.findUniqueOrThrow({ where: { clientId: session.id } });
    await prisma.genieShare.create({ data: { tenantId: c.tenant.id, eventId: c.event.id, sessionId: s.id, clientId: randomUUID(), channel: 'email', destination: 'a@b.co', status: 'sent', requestedAt: new Date() } });
    await upload(c, session, 'gallery');
    expect(await prisma.genieShare.count({ where: { kind: 'aiReady' } })).toBe(0);
    await prisma.genieAiRender.create({ data: { tenantId: c.tenant.id, eventId: c.event.id, sessionClientId: session.id, shotIndex: 0, themeId: 't', idempotencyKey: session.id + ':0:t',
      status: 'done', inputKey: '', resultKey: 'ai/r.jpg', consentAcceptedAt: new Date(), consentTextSha256: 'b'.repeat(64) } });
    const latest = await upload(c, session, 'gallery');
    expect(latest.res.status).toBe(201);
    expect(await prisma.genieShare.count({ where: { kind: 'aiReady' } })).toBe(1);
    expect(galleryReplaced).toBeTypeOf('function');
  });
});
