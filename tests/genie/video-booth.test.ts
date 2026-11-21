import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Genie P14: Video Booth (EventBundle.videoBooth, Video Booth uploads, the guest page, galleries, the Videos tab)

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));
const objects = new Map<string, number>();
const deleted: string[] = [];
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  getPresignedUploadUrl: vi.fn(async (key: string) => 'https://r2.test/upload/' + key),
  headR2Object: vi.fn(async (key: string) => (objects.has(key) ? { bytes: objects.get(key)! } : null)),
  deleteFromR2: vi.fn(async (key: string) => { deleted.push(key); }),
  getR2ObjectStream: vi.fn(async (key: string) => {
    const bytes = new TextEncoder().encode('mp4:' + key);
    return { body: new Blob([bytes]).stream(), bytes: bytes.length, lastModified: new Date() };
  }),
  r2PublicUrl: (key: string) => 'https://media.boothgen.test/' + key,
}));

import { prisma } from '@/lib/prisma/client';
import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { GET as GET_DEFAULTS, PUT as PUT_DEFAULTS } from '@/app/api/genie-defaults/route';
import { GET as deviceBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { POST as uploadUrl } from '@/app/api/genie/events/[eventId]/upload-url/route';
import { POST as registerAsset } from '@/app/api/genie/events/[eventId]/assets/route';
import { GET as sessionPage } from '@/app/api/g/[token]/s/[sessionToken]/route';
import { GET as publicGallery } from '@/app/api/g/[token]/route';
import { GET as hostGallery } from '@/app/api/gallery/[id]/route';
import { GET as hostAssets } from '@/app/api/gallery/[id]/assets/route';
import { DELETE as deleteAsset, PATCH as patchAsset } from '@/app/api/gallery/[id]/assets/[assetId]/route';
import { GET as videosZip } from '@/app/api/gallery/[id]/videos/zip/route';
import { bundleValidator, guestSession, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const ev = (id: string) => ({ params: Promise.resolve({ id }) });
const evId = (eventId: string) => ({ params: Promise.resolve({ eventId }) });

const VIDEO = {
  enabled: true, offer: 'alongsidePhotos', prompts: [{ id: 'couple', text: 'Leave a message for the couple' }, { id: 'advice', text: 'Best advice for the newlyweds' }],
  maxSeconds: 30, retakes: 2, videoSize: '720p', format: 'portrait9x16', design: null, consentText: null, showInGallery: false,
};
const slot = (x: number, y: number, width: number, height: number) => ({ id: 's1', shotIndex: 0, x, y, width, height, rotationDegrees: 0, fit: 'fill' });
const layout = (format: string, orientation: string, widthPx: number, heightPx: number) =>
  ({ format, orientation, widthPx, heightPx, dpi: 300, backgroundColor: '#FFFFFF', slots: [slot(0, 0, widthPx, heightPx)] });

let validate: Awaited<ReturnType<typeof bundleValidator>>;
const valid = (b: unknown) => { if (validate) expect(validate(b)).toBeNull(); };

async function setup() {
  const { tenant, client } = await seedTenant();
  sessionTenantId = tenant.id;
  const event = await seedEvent(tenant.id, client.id);
  const { token } = await seedDevice(tenant.id);
  const bundle = async () => (await deviceBundle(req('/x', { token }), evId(event.id))).json();
  const patch = (v: Record<string, unknown>) => PATCH(req('/x', { method: 'PATCH', body: { videoBooth: { ...VIDEO, ...v } } }), ev(event.id));
  return { tenant, client, event, token, bundle, patch };
}

beforeEach(async () => { await resetDb(); objects.clear(); deleted.length = 0; validate ??= await bundleValidator(); });
afterAll(resetDb);

describe('Video Booth settings and bundle', () => {
  it('is off and absent from the bundle by default; on it sends the schema shape with the default consent; changes bump the version', async () => {
    const { event, bundle, patch } = await setup();
    const d = await (await DASH(req('/x'), ev(event.id))).json();
    expect(d.settings.videoBooth).toMatchObject({ enabled: false, maxSeconds: 30, retakes: 2, videoSize: '720p', showInGallery: false, design: null, consentText: null });
    expect(d.settings.custom.videoBooth).toBe(false);
    const before = await bundle();
    expect(before.videoBooth).toBeUndefined();

    expect((await patch({})).status).toBe(200);
    const on = await bundle();
    expect(on.videoBooth).toEqual({
      enabled: true, offer: 'alongsidePhotos', prompts: VIDEO.prompts, maxSeconds: 30, retakes: 2, videoSize: '720p', format: 'portrait9x16',
      consentText: 'Your video will be shared with the host.', showInGallery: false,
    });
    expect(on.bundleVersion).toBe(before.bundleVersion + 1);
    valid(on);

    await patch({ showInGallery: true, offer: 'videoOnly', videoSize: '480p' });
    const shown = await bundle();
    expect(shown.videoBooth).toMatchObject({ offer: 'videoOnly', videoSize: '480p', showInGallery: true, consentText: "Your video will be shared with the host and may appear in the event's gallery." });
    expect(shown.bundleVersion).toBe(on.bundleVersion + 1);
    valid(shown);

    await patch({ consentText: '  Be nice!  ' });
    expect((await bundle()).videoBooth.consentText).toBe('Be nice!');
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).customVideoBooth).toBe(true);

    await patch({ enabled: false });
    expect((await bundle()).videoBooth).toBeUndefined();
  });

  it('checks prompts, length, re-records and size', async () => {
    const { patch } = await setup();
    const bad = async (v: Record<string, unknown>) => { const r = await patch(v); expect(r.status).toBe(400); return (await r.json()).error as string; };
    expect(await bad({ prompts: [] })).toMatch(/at least one prompt/);
    expect(await bad({ prompts: Array.from({ length: 9 }, (_, i) => ({ id: 'p' + i, text: 'Prompt ' + i })) })).toMatch(/At most 8/);
    expect(await bad({ prompts: [{ id: 'a', text: 'One' }, { id: 'a', text: 'Two' }] })).toMatch(/own id/);
    expect(await bad({ prompts: [{ id: 'bad id!', text: 'One' }] })).toBeTruthy();
    expect(await bad({ prompts: [{ id: 'a', text: 'x'.repeat(121) }] })).toMatch(/120/);
    expect(await bad({ maxSeconds: 9 })).toMatch(/10 to 120/);
    expect(await bad({ maxSeconds: 121 })).toMatch(/10 to 120/);
    expect(await bad({ retakes: 6 })).toMatch(/0 to 5/);
    expect(await bad({ videoSize: '1080p' })).toBeTruthy();
    expect(await bad({ consentText: 'x'.repeat(301) })).toMatch(/300/);
  });

  it('sends a single-photo template as the design at the video\'s shape; a deleted one is left out', async () => {
    const { event, bundle, patch } = await setup();
    const wide = await prisma.boothDesignTemplate.create({ data: { tenantId: null, name: 'Test Story', format: '9x16', orientation: 'portrait', photoCount: 1, isPublished: true, layout: layout('9x16', 'portrait', 1080, 1920) } as any });
    expect((await patch({ format: 'square', design: { source: 'print', id: wide.id } })).status).toBe(400);
    expect((await patch({ format: 'portrait9x16', design: { source: 'print', id: wide.id } })).status).toBe(200);
    const b = await bundle();
    expect(b.videoBooth.design).toMatchObject({ id: wide.id, format: 'portrait9x16', slot: slot(0, 0, 1080, 1920) });
    valid(b);

    await prisma.boothDesignTemplate.update({ where: { id: wide.id }, data: { isActive: false } });
    expect((await bundle()).videoBooth.design).toBeUndefined();
    const d = await (await DASH(req('/x'), ev(event.id))).json();
    expect(d.settings.videoBooth.designProblem).toBe('deleted');
  });

  it('follows the account defaults until changed on the event, and can be put back on them', async () => {
    const { tenant, client, event } = await setup();
    const r = await PUT_DEFAULTS(req('/x', { method: 'PUT', body: { videoBooth: { ...VIDEO, retakes: 4 } } }));
    expect(r.status).toBe(200);
    expect((await (await GET_DEFAULTS()).json()).videoBooth).toMatchObject({ enabled: true, retakes: 4 });
    // The existing event follows them
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).videoBooth).toMatchObject({ enabled: true, retakes: 4 });
    // A new event starts with them
    const other = await seedEvent(tenant.id, client.id, { settings: false });
    const { POST: SETUP } = await import('@/app/api/events/[id]/genie/route');
    expect((await SETUP(req('/x', { body: {} }), ev(other.id))).status).toBe(201);
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: other.id } })).videoBooth).toMatchObject({ retakes: 4 });

    await PATCH(req('/x', { method: 'PATCH', body: { videoBooth: { ...VIDEO, retakes: 1 } } }), ev(event.id));
    await PUT_DEFAULTS(req('/x', { method: 'PUT', body: { videoBooth: { ...VIDEO, retakes: 5 } } }));
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).videoBooth).toMatchObject({ retakes: 1 });
    await PATCH(req('/x', { method: 'PATCH', body: { reset: ['videoBooth'] } }), ev(event.id));
    const s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(s.videoBooth).toMatchObject({ retakes: 5 });
    expect(s.customVideoBooth).toBe(false);
  });
});

describe('Video Booth uploads, pages and galleries', () => {
  async function upload(eventId: string, token: string, body: Record<string, unknown>) {
    const u = await uploadUrl(req('/x', { token, body: { clientId: body.clientId, fileName: body.fileName, contentType: body.contentType, bytes: body.bytes } }), evId(eventId));
    if (u.status !== 200) return u;
    const { storageKey } = await u.json();
    objects.set(storageKey, body.bytes as number);
    return registerAsset(req('/x', { token, body: { ...body, storageKey } }), evId(eventId));
  }
  const poster = (session: ReturnType<typeof guestSession>) => ({
    clientId: randomUUID(), session, kind: 'videoPoster', fileName: 'poster.jpg', contentType: 'image/jpeg', bytes: 60_000,
    width: 405, height: 720, sha256: 'a'.repeat(64), capturedAt: '2026-12-12T23:41:10Z',
  });
  const video = (session: ReturnType<typeof guestSession>, over: Record<string, unknown> = {}) => ({
    clientId: randomUUID(), session, kind: 'video', fileName: 'message.mp4', contentType: 'video/mp4', bytes: 30 * 1024 * 1024,
    width: 720, height: 1280, sha256: 'b'.repeat(64), capturedAt: '2026-12-12T23:41:40Z', durationMs: 24_500,
    promptId: 'couple', promptText: 'Leave a message for the couple', ...over,
  });

  it('accepts a Video Booth video from a Genie session with its prompt; durationMs is required; prompts only on video', async () => {
    const { event, token } = await setup();
    const s = guestSession();
    expect((await upload(event.id, token, video(s, { durationMs: undefined }))).status).toBe(400);
    expect((await upload(event.id, token, { ...poster(s), promptId: 'couple' })).status).toBe(400);
    expect((await upload(event.id, token, video(s, { bytes: 51 * 1024 * 1024 }))).status).toBe(400);
    const r = await upload(event.id, token, video(s));
    expect(r.status).toBe(201);
    const a = await prisma.galleryAsset.findUniqueOrThrow({ where: { id: (await r.json()).assetId } });
    expect(a).toMatchObject({ genieKind: 'video', assetType: 'VIDEO', source: null, promptId: 'couple', promptText: 'Leave a message for the couple', durationMs: 24_500 });
    // A PC booth video without durationMs still goes through (older Sharing station iPads)
    const pc = await upload(event.id, token, video(guestSession(), { promptId: undefined, promptText: undefined, durationMs: undefined, source: 'pcBooth' }));
    expect(pc.status).toBe(201);
  });

  it('props on video (P14.1): sent only while the event\'s props are on; propId only on video, stored and named in Videos', async () => {
    const { tenant, event, token, bundle, patch } = await setup();
    expect((await patch({ props: true })).status).toBe(200);
    // The event's props are off: left out
    expect((await bundle()).videoBooth.props).toBeUndefined();
    const prop = await prisma.genieProp.create({ data: { tenantId: tenant.id, name: 'Classic shades', category: 'glasses', subcategory: 'all', image: { url: 'https://media.boothgen.test/p.png', sha256: 'c'.repeat(64), contentType: 'image/png', bytes: 10 }, width: 1, height: 0.4, anchor: 'eyes', anchorX: 0.5, anchorY: 0.5 } });
    await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { propsEnabled: true, propIds: [prop.id] } });
    const on = await bundle();
    expect(on.videoBooth.props).toBe(true);
    valid(on);
    await patch({ props: false });
    expect((await bundle()).videoBooth.props).toBeUndefined();

    const s = guestSession();
    expect((await upload(event.id, token, { ...poster(s), propId: prop.id })).status).toBe(400);
    const r = await upload(event.id, token, video(s, { propId: prop.id }));
    expect(r.status).toBe(201);
    const id = (await r.json()).assetId;
    expect(await prisma.galleryAsset.findUniqueOrThrow({ where: { id } })).toMatchObject({ propId: prop.id });
    const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId: event.id } });
    const assets = await (await hostAssets(req('/x'), ev(gallery.id))).json();
    expect(assets.find((a: { id: string }) => a.id === id)).toMatchObject({ propId: prop.id, propName: 'Classic shades' });
  });

  it('session page: the poster with "on its way" until the video lands, then a player with the prompt; hidden videos are left out', async () => {
    const { event, token } = await setup();
    const s = guestSession();
    const p = await upload(event.id, token, poster(s));
    expect(p.status).toBe(201);
    const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId: event.id } });
    const page = async () => (await sessionPage(req('/x'), { params: Promise.resolve({ token: gallery.clientToken!, sessionToken: s.publicToken }) })).json();
    const posterUrl = (await p.json()).url;
    const waiting = await page();
    expect(waiting.assets).toEqual([]);
    expect(waiting.videoPending).toEqual({ posterUrl, width: 405, height: 720 });
    expect(waiting.boothOffline).toBe(false);

    const v = await (await upload(event.id, token, video(s))).json();
    const ready = await page();
    expect(ready.videoPending).toBeNull();
    expect(ready.morePending).toBe(false);
    expect(ready.assets).toEqual([expect.objectContaining({ id: v.assetId, isVideoMessage: true, isBoomerang: true, posterUrl, promptText: 'Leave a message for the couple', durationMs: 24_500 })]);

    await patchAsset(req('/x', { method: 'PATCH', body: { hidden: true } }), { params: Promise.resolve({ id: gallery.id, assetId: v.assetId }) });
    expect((await page()).assets).toEqual([]);
  });

  it('the public gallery leaves Video Booth videos out unless the event shows them; the host sees them in Videos and can delete and zip them', async () => {
    const { event, token, patch } = await setup();
    await patch({});
    const s = guestSession();
    await upload(event.id, token, poster(s));
    const gallery = await prisma.gallery.update({ where: { eventId: event.id }, data: { isPublished: true } });
    const v = await (await upload(event.id, token, video(s))).json();
    const photo = await upload(event.id, token, { ...poster(guestSession()), kind: 'gallery', fileName: 'design.jpg' });
    expect(photo.status).toBe(201);
    const pub = async () => ((await (await publicGallery(req('/x'), { params: Promise.resolve({ token: gallery.clientToken! }) })).json()).assets as { id: string }[]).map(a => a.id);

    expect(await pub()).not.toContain(v.assetId);
    expect(await pub()).toHaveLength(1);
    await patch({ showInGallery: true });
    expect(await pub()).toContain(v.assetId);
    await patchAsset(req('/x', { method: 'PATCH', body: { hidden: true } }), { params: Promise.resolve({ id: gallery.id, assetId: v.assetId }) });
    expect(await pub()).not.toContain(v.assetId);

    // Host: the gallery says whether videos show publicly; the assets list has the video with its prompt
    const g = await (await hostGallery(req('/x'), ev(gallery.id))).json();
    expect(g.videosInGallery).toBe(true);
    const assets = await (await hostAssets(req('/x'), ev(gallery.id))).json();
    expect(assets.find((a: { id: string }) => a.id === v.assetId)).toMatchObject({ promptText: 'Leave a message for the couple' });

    // Download all videos: one ZIP streamed back
    const zip = await videosZip(req('/x'), ev(gallery.id));
    expect(zip.status).toBe(200);
    expect(zip.headers.get('content-type')).toBe('application/zip');
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(new TextDecoder().decode(bytes)).toContain('video-001.mp4');

    // Delete: the video and its poster leave the gallery and storage
    expect((await deleteAsset(req('/x', { method: 'DELETE' }), { params: Promise.resolve({ id: gallery.id, assetId: v.assetId }) })).status).toBe(200);
    expect(await prisma.galleryAsset.count({ where: { genieSessionId: { not: null }, genieKind: { in: ['video', 'videoPoster'] } } })).toBe(0);
    expect(deleted.length).toBe(2);
    expect((await videosZip(req('/x'), ev(gallery.id))).status).toBe(404);
  });
});
