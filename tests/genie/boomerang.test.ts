import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));

// Stored files: device uploads (size only) and designer uploads (bytes)
const BASE = 'https://media.boothgen.test/';
const objects = new Map<string, number>();
const files = new Map<string, Buffer>();
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  getPresignedUploadUrl: vi.fn(async (key: string) => 'https://r2.test/upload/' + key),
  headR2Object: vi.fn(async (key: string) => (objects.has(key) ? { bytes: objects.get(key)! } : null)),
  getR2Object: vi.fn(async (key: string) => (files.has(key) ? { body: files.get(key)! } : null)),
  r2PublicUrl: (key: string) => BASE + key,
  r2KeyForPublicUrl: (url: string) => (url.startsWith(BASE) ? url.slice(BASE.length) : null),
}));

import { prisma } from '@/lib/prisma/client';
import { POST as uploadUrl } from '@/app/api/genie/events/[eventId]/upload-url/route';
import { POST as registerAsset } from '@/app/api/genie/events/[eventId]/assets/route';
import { GET as deviceBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { GET as guestSessionApi } from '@/app/api/g/[token]/s/[sessionToken]/route';
import { GET as galleryApi } from '@/app/api/g/[token]/route';
import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { bundleValidator, guestSession, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const ev = (eventId: string) => ({ params: { eventId } });
const p = (id: string) => ({ params: { id } });

// Minimal PNG header: signature + IHDR (colour type 6 = RGBA, 2 = RGB without alpha)
function png(width: number, height: number, alpha = true): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20); b[24] = 8; b[25] = alpha ? 6 : 2;
  return b;
}
function overlay(tenantId: string, width: number, height: number, alpha = true): string {
  const key = `genie-templates/${tenantId}/${randomUUID()}.png`;
  files.set(key, png(width, height, alpha));
  return BASE + key;
}

const BOOMERANG = { enabled: true, format: 'square', frameCount: 12, playbackSpeed: 'fast', reverse: true, superSpeedCapture: false, showOverlayOnLiveView: true, mirrorLiveView: true };

async function setup() {
  const { tenant, client } = await seedTenant();
  sessionTenantId = tenant.id;
  const event = await seedEvent(tenant.id, client.id);
  const { token } = await seedDevice(tenant.id);
  return { tenant, event, token };
}

async function upload(token: string, tenantId: string, eventId: string, session: ReturnType<typeof guestSession>, kind: string, extra: Record<string, unknown> = {}) {
  const gallery = await prisma.gallery.upsert({ where: { eventId }, update: {}, create: { tenantId, eventId, title: 'G' } });
  const clientId = randomUUID();
  const mp4 = kind === 'boomerang';
  const storageKey = `galleries/${tenantId}/${gallery.id}/genie-${clientId}-${mp4 ? 'boomerang.mp4' : kind + '.jpg'}`;
  objects.set(storageKey, 3000);
  return registerAsset(req('/x', {
    token, body: {
      clientId, session, kind, storageKey, fileName: mp4 ? 'boomerang.mp4' : 'poster.jpg', contentType: mp4 ? 'video/mp4' : 'image/jpeg',
      bytes: 3000, width: 1080, height: 1080, sha256: 'b'.repeat(64), capturedAt: '2026-12-12T23:41:40Z', ...(mp4 ? { durationMs: 5040 } : {}), ...extra,
    },
  }), ev(eventId));
}

beforeEach(async () => { await resetDb(); objects.clear(); files.clear(); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Boomerang uploads', () => {
  it('gives an upload URL for an MP4 and registers the clip as a video, with its poster as the thumbnail', async () => {
    const { tenant, event, token } = await setup();
    const r = await uploadUrl(req('/x', { token, body: { clientId: randomUUID(), fileName: 'boomerang.mp4', contentType: 'video/mp4', bytes: 3000 } }), ev(event.id));
    expect(r.status).toBe(200);

    const session = guestSession();
    expect((await upload(token, tenant.id, event.id, session, 'boomerangPoster')).status).toBe(201);
    expect((await upload(token, tenant.id, event.id, session, 'boomerang')).status).toBe(201);
    const clip = await prisma.galleryAsset.findFirstOrThrow({ where: { genieKind: 'boomerang' } });
    const poster = await prisma.galleryAsset.findFirstOrThrow({ where: { genieKind: 'boomerangPoster' } });
    expect(clip).toMatchObject({ assetType: 'VIDEO', mimeType: 'video/mp4', durationMs: 5040, thumbnailUrl: poster.url, sortOrder: 0 });

    // Clip first, poster later: the poster still becomes the thumbnail
    const s2 = guestSession();
    await upload(token, tenant.id, event.id, s2, 'boomerang');
    await upload(token, tenant.id, event.id, s2, 'boomerangPoster');
    const sess = await prisma.genieSession.findUniqueOrThrow({ where: { clientId: s2.id }, include: { assets: true } });
    const c2 = sess.assets.find(a => a.genieKind === 'boomerang')!, p2 = sess.assets.find(a => a.genieKind === 'boomerangPoster')!;
    expect(c2.thumbnailUrl).toBe(p2.url);
  });

  it('accepts MP4 only for kind boomerang, and durationMs only on the clip', async () => {
    const { tenant, event, token } = await setup();
    const session = guestSession();
    expect((await upload(token, tenant.id, event.id, session, 'gallery', { contentType: 'video/mp4' })).status).toBe(400);
    expect((await upload(token, tenant.id, event.id, session, 'boomerang', { contentType: 'image/jpeg' })).status).toBe(400);
    expect((await upload(token, tenant.id, event.id, session, 'shot', { shotIndex: 0, durationMs: 100 })).status).toBe(400);
  });

  it('shows the clip first on the guest page, hides the poster from photo lists, and stops waiting for more photos', async () => {
    const { tenant, event, token } = await setup();
    const session = guestSession();
    await upload(token, tenant.id, event.id, session, 'boomerangPoster');
    // Poster only: still "uploading"
    const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId: event.id } });
    const sp = { params: { token: gallery.clientToken, sessionToken: session.publicToken } };
    expect((await (await guestSessionApi(req('/x'), sp)).json()).assets).toEqual([]);

    await upload(token, tenant.id, event.id, session, 'boomerang');
    const d = await (await guestSessionApi(req('/x'), sp)).json();
    expect(d.assets).toHaveLength(1);
    expect(d.assets[0]).toMatchObject({ isBoomerang: true, isGallery: false });
    expect(d.assets[0].url).toMatch(/\.mp4$/);
    expect(d.assets[0].posterUrl).toMatch(/\.jpg$/);
    expect(d.morePending).toBe(false);

    await prisma.gallery.update({ where: { id: gallery.id }, data: { isPublished: true } });
    const g = await (await galleryApi(req('/x'), { params: { token: gallery.clientToken } })).json();
    expect(g.assets.map((a: any) => a.genieKind)).toEqual(['boomerang']);
    expect(g.assets[0].thumbnailUrl).toMatch(/\.jpg$/);
  });
});

describe('Look at the camera and Boomerang settings', () => {
  it('leaves both out of the bundle until set, so existing bundles keep their version', async () => {
    const { event, token } = await setup();
    const b = await (await deviceBundle(req('/x', { token }), ev(event.id))).json();
    expect(b.capture.lookAtCamera).toBeUndefined();
    expect(b.capture.boomerang).toBeUndefined();
    const dash = await (await DASH(req('/x'), p(event.id))).json();
    expect(dash.settings.lookAtCamera).toEqual({ enabled: true, text: 'LOOK AT CAMERA', frequency: 'everyPhoto' });
    expect(dash.settings.boomerang).toMatchObject({ enabled: false, format: 'square', frameCount: 12, playbackSpeed: 'fast', overlay: null });
  });

  it('saves them, sends them in the bundle (overlay as a RemoteAsset) and bumps the bundle version', async () => {
    const { tenant, event, token } = await setup();
    const v1 = (await (await deviceBundle(req('/x', { token }), ev(event.id))).json()).bundleVersion;
    const url = overlay(tenant.id, 1080, 1080);
    const r = await PATCH(req('/x', { method: 'PATCH', body: {
      lookAtCamera: { enabled: true, text: 'Eyes up here!', frequency: 'firstPhoto' },
      boomerang: { ...BOOMERANG, overlayUrl: url },
    } }), p(event.id));
    expect(r.status).toBe(200);
    const view = await r.json();
    expect(view.boomerang.overlay).toEqual({ url, width: 1080, height: 1080 });

    const b = await (await deviceBundle(req('/x', { token }), ev(event.id))).json();
    expect(b.bundleVersion).toBe(v1 + 1);
    expect(b.capture.lookAtCamera).toEqual({ enabled: true, text: 'Eyes up here!', frequency: 'firstPhoto' });
    expect(b.capture.boomerang).toEqual({ ...BOOMERANG, overlay: { url, sha256: expect.stringMatching(/^[0-9a-f]{64}$/), contentType: 'image/png', bytes: 33 } });
    const validate = await bundleValidator();
    if (validate) expect(validate(b)).toBeNull();

    // Saving again without overlayUrl keeps the overlay; null removes it
    await PATCH(req('/x', { method: 'PATCH', body: { boomerang: { ...BOOMERANG, frameCount: 14 } } }), p(event.id));
    expect((await (await deviceBundle(req('/x', { token }), ev(event.id))).json()).capture.boomerang.overlay.url).toBe(url);
    await PATCH(req('/x', { method: 'PATCH', body: { boomerang: { ...BOOMERANG, overlayUrl: null } } }), p(event.id));
    expect((await (await deviceBundle(req('/x', { token }), ev(event.id))).json()).capture.boomerang.overlay).toBeUndefined();
  });

  it("refuses an overlay in the wrong shape, without transparency, or from another account's storage", async () => {
    const { tenant, event } = await setup();
    const patch = (b: Record<string, unknown>) => PATCH(req('/x', { method: 'PATCH', body: { boomerang: { ...BOOMERANG, ...b } } }), p(event.id));
    const wrongShape = await patch({ overlayUrl: overlay(tenant.id, 1080, 1620) });
    expect(wrongShape.status).toBe(400);
    expect((await wrongShape.json()).error).toMatch(/1080×1620.*1080×1080/);
    expect((await patch({ overlayUrl: overlay(tenant.id, 1080, 1080, false) })).status).toBe(400);
    expect((await patch({ overlayUrl: overlay('someone-else', 1080, 1080) })).status).toBe(400);

    // A kept overlay must still fit when the format changes
    expect((await patch({ overlayUrl: overlay(tenant.id, 1080, 1620), format: 'portrait4x6' })).status).toBe(200);
    expect((await patch({ format: 'landscape6x4' })).status).toBe(400);
    expect((await patch({ format: 'landscape6x4', overlayUrl: null })).status).toBe(200);
  });

  it('validates the wording and number ranges', async () => {
    const { event } = await setup();
    const bad = [
      { lookAtCamera: { enabled: true, text: 'x'.repeat(41), frequency: 'everyPhoto' } },
      { lookAtCamera: { enabled: true, text: '  ', frequency: 'everyPhoto' } },
      { boomerang: { ...BOOMERANG, frameCount: 9 } },
      { boomerang: { ...BOOMERANG, frameCount: 17 } },
      { boomerang: { ...BOOMERANG, playbackSpeed: 'ludicrous' } },
    ];
    for (const body of bad) expect((await PATCH(req('/x', { method: 'PATCH', body }), p(event.id))).status).toBe(400);
  });
});
