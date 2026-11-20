import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Genie P15: Genie 360 (the spinner booth): the paid add-on, the event's 360 section, the libraries, galleries

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  getPresignedUploadUrl: vi.fn(async (key: string) => 'https://r2.test/upload/' + key),
  r2PublicUrl: (key: string) => 'https://media.boothgen.test/' + key,
}));

import { prisma } from '@/lib/prisma/client';
import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { GET as LIBRARY } from '@/app/api/genie-360/library/route';
import { POST as UPLOAD } from '@/app/api/genie-360/upload/route';
import { GET as BACKDROPS } from '@/app/api/genie-backdrops/route';
import { GET as publicGallery } from '@/app/api/g/[token]/route';
import { GET as sessionPage } from '@/app/api/g/[token]/s/[sessionToken]/route';
import { MusicLinkBody } from '@/app/api/super-admin/genie-360/links/body';
import { eventBilling } from '@/lib/genie/payments';
import { ensureGallery } from '@/lib/genie/bundle';
import { copyGenieSetup } from '@/lib/genie/duplicate';
import { SPIN360_DEFAULT } from '@/lib/genie/spin360Options';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const ev = (id: string) => ({ params: Promise.resolve({ id }) });
const READY = 'genie360_ready';
const file = (name: string) => ({ url: 'https://media.boothgen.test/genie-music/standard/' + name, sha256: 'a'.repeat(64), contentType: 'audio/mpeg', bytes: 1000 });

async function setup() {
  const { tenant, client } = await seedTenant();
  await prisma.tenant.update({ where: { id: tenant.id }, data: { product: 'genie' } });
  sessionTenantId = tenant.id;
  const event = await seedEvent(tenant.id, client.id);
  const patch = (v: Record<string, unknown>) => PATCH(req('/x', { method: 'PATCH', body: { spin360: { ...SPIN360_DEFAULT, enabled: true, ...v } } }), ev(event.id));
  return { tenant, client, event, patch };
}
const ready = (on: boolean) => prisma.systemSetting.upsert({ where: { key: READY }, update: { value: on ? 'on' : 'off' }, create: { key: READY, value: on ? 'on' : 'off' } });

const cleanLibrary = async () => {
  await prisma.genieMusicTrack.deleteMany({ where: { tenantId: null, name: { startsWith: 'Test ' } } });
  await prisma.genieBackdrop.deleteMany({ where: { tenantId: null, name: { startsWith: 'Test ' } } });
  await prisma.systemSetting.deleteMany({ where: { key: { in: [READY, 'addon_price_cents_genie360'] } } });
};
beforeEach(async () => { await resetDb(); await cleanLibrary(); });
afterAll(async () => { await resetDb(); await cleanLibrary(); await prisma.$disconnect(); });

describe('Genie 360 add-on', () => {
  it('is hidden until Super Admin makes it available; then turning it on charges $25 with the event, watermarked until paid', async () => {
    const { tenant, event, patch } = await setup();
    const dash = await (await DASH(req('/x'), ev(event.id))).json();
    expect(dash.genie360).toEqual({ available: false });
    expect(dash.settings.spin360).toMatchObject({ enabled: false, styleId: 'classic', format: 'portrait9x16', videoSize: '1080p', videoSeconds: 15, showInGallery: true });

    const refused = await patch({});
    expect(refused.status).toBe(400);
    expect((await refused.json()).error).toBe("Genie 360 isn't available yet");

    await ready(true);
    expect((await patch({})).status).toBe(200);
    expect(await eventBilling(tenant, event.id)).toMatchObject({ addOns: ['genie360'], addOnsDue: [{ id: 'genie360', name: 'Genie 360', cents: 2500 }], watermark: true });

    // An event that has it keeps it after the switch goes off; turning it off stops the charge
    await ready(false);
    expect((await patch({ videoSeconds: 20 })).status).toBe(200);
    expect((await patch({ enabled: false })).status).toBe(200);
    expect(await eventBilling(tenant, event.id)).toMatchObject({ addOns: [] });
  });

  it('checks the style, song, backdrop, lengths and intro; a copied event keeps the 360 setup', async () => {
    const { tenant, client, event, patch } = await setup();
    await ready(true);
    const err = async (v: Record<string, unknown>) => { const r = await patch(v); expect(r.status).toBe(400); return (await r.json()).error as string; };

    expect(await err({ styleId: 'nope' })).toMatch(/style isn't available/);
    expect(await err({ videoSeconds: 40 })).toBe('Videos are 8 to 30 seconds');
    expect(await err({ backgroundRemoval: { enabled: true, backdropId: null, followSpin: true } })).toMatch(/Pick a backdrop/);
    expect(await err({ intro: { kind: 'image', seconds: 3, media: null } })).toMatch(/Upload the intro image/);
    expect(await err({ outro: { kind: 'logoCard', seconds: 5, media: null } })).toBe('A logo card outro is 1 to 4 seconds.');

    // Another account's song is refused; a Standard one is fine, starting before it ends
    const other = await seedTenant();
    const theirs = await prisma.genieMusicTrack.create({ data: { tenantId: other.tenant.id, name: 'Theirs', file: file('x.mp3'), durationMs: 60_000 } });
    expect(await err({ music: { trackId: theirs.id, startMs: 0, volume: 0.8 } })).toMatch(/isn't in your library/);
    const std = await prisma.genieMusicTrack.create({ data: { tenantId: null, name: 'Test Groove', file: file('g.mp3'), durationMs: 60_000 } });
    expect(await err({ music: { trackId: std.id, startMs: 61_000, volume: 0.8 } })).toMatch(/starts after it ends/);
    const ok = await patch({ styleId: 'glow', music: { trackId: std.id, startMs: 12_000, volume: 0.7 }, outro: { kind: 'logoCard', seconds: 2, media: null }, title: { lines: [' Rivera Wedding '], color: '#FFFFFF', font: 'montserrat', animation: 'fade', position: 'bottom' } });
    expect(ok.status).toBe(200);
    const saved = (await ok.json()).spin360;
    expect(saved).toMatchObject({ enabled: true, styleId: 'glow', music: { trackId: std.id, startMs: 12_000 }, outro: { kind: 'logoCard', seconds: 2 }, title: { lines: ['Rivera Wedding'] } });

    // The operator's own song can't be deleted while an event uses it; another account's can't be touched
    const { DELETE } = await import('@/app/api/genie-360/music/[trackId]/route');
    const mine = await prisma.genieMusicTrack.create({ data: { tenantId: tenant.id, name: 'Mine', file: file('m.mp3'), durationMs: 30_000, rightsConfirmedAt: new Date() } });
    expect((await patch({ styleId: 'glow', music: { trackId: mine.id, startMs: 0, volume: 0.7 } })).status).toBe(200);
    const del = (trackId: string) => DELETE(req('/x', { method: 'DELETE' }), { params: Promise.resolve({ trackId }) });
    expect((await del(mine.id)).status).toBe(409);
    expect((await del(theirs.id)).status).toBe(404);
    expect((await patch({ styleId: 'glow', music: { trackId: std.id, startMs: 12_000, volume: 0.7 }, outro: { kind: 'logoCard', seconds: 2, media: null } })).status).toBe(200);
    expect((await del(mine.id)).status).toBe(200);

    const copy = await seedEvent(tenant.id, client.id, { settings: false, templates: 0 });
    await prisma.$transaction(tx => copyGenieSetup(tx, event.id, copy.id, tenant.id));
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: copy.id } })).spin360).toMatchObject({ styleId: 'glow', enabled: true });
  });
});

describe('Genie 360 library', () => {
  it('starts with the six styles; 360 panoramas come first in its backdrops and stay out of photo booth pickers', async () => {
    await setup();
    const pano = await prisma.genieBackdrop.create({ data: { tenantId: null, name: 'Test Pano', image: file('p.jpg'), width: 6000, height: 1500, tags: ['360'], sortOrder: 999 } });
    const flat = await prisma.genieBackdrop.create({ data: { tenantId: null, name: 'Test Flat', image: file('f.jpg'), width: 1800, height: 1200, sortOrder: 998 } });
    const lib = await (await LIBRARY()).json();
    expect(lib.styles.map((s: { id: string }) => s.id)).toEqual(['classic', 'slowSmooth', 'boomerang', 'hype', 'glow', 'dreamscape']);
    expect(lib.styles.find((s: { id: string }) => s.id === 'glow').defaultEffects).toEqual({ lightTrails: true });
    const ids = lib.backdrops.map((b: { id: string }) => b.id);
    expect(ids.indexOf(pano.id)).toBeLessThan(ids.indexOf(flat.id));
    expect(lib.backdrops.find((b: { id: string }) => b.id === pano.id).is360).toBe(true);

    const booth = await (await BACKDROPS()).json();
    const boothIds = JSON.stringify(booth);
    expect(boothIds).toContain(flat.id);
    expect(boothIds).not.toContain(pano.id);
  });

  it('uploads: songs MP3 / M4A ≤ 10 MB, Example videos only for Super Admin; music links must be https', async () => {
    await setup();
    const up = (body: Record<string, unknown>) => UPLOAD(req('/x', { method: 'POST', body: { scope: 'mine', ...body } }));
    const r = await up({ kind: 'music', contentType: 'audio/mpeg', bytes: 1000 });
    expect(r.status).toBe(200);
    expect((await r.json()).url).toMatch(/^https:\/\/media\.boothgen\.test\/genie-music\/[^/]+\/uploads\/.+\.mp3$/);
    expect((await (await up({ kind: 'music', contentType: 'audio/wav', bytes: 1000 })).json()).error).toBe('Use an MP3 or M4A file.');
    expect((await (await up({ kind: 'music', contentType: 'audio/mpeg', bytes: 11 * 1024 * 1024 })).json()).error).toBe('Songs must be 10 MB or smaller.');
    expect((await up({ kind: 'sample', contentType: 'video/mp4', bytes: 1000 })).status).toBe(403);
    expect(MusicLinkBody.safeParse({ name: 'Epidemic Sound', url: 'http://x.test' }).success).toBe(false);
    expect(MusicLinkBody.safeParse({ name: 'Epidemic Sound', url: 'https://www.epidemicsound.com/?ref=x' }).data).toMatchObject({ note: '' });
  });
});

describe('Genie 360 videos', () => {
  it('show in the public gallery unless the event turns that off, with a 360 badge on the guest page', async () => {
    const { event, patch } = await setup();
    await ready(true);
    await ensureGallery(event);
    const gallery = await prisma.gallery.update({ where: { eventId: event.id }, data: { isPublished: true } });
    const s = await prisma.genieSession.create({ data: { tenantId: event.tenantId, eventId: event.id, galleryId: gallery.id, clientId: randomUUID(), publicToken: randomUUID().slice(0, 24), startedAt: new Date(), mode: 'spin360', styleId: 'classic' } });
    const base = { galleryId: gallery.id, genieSessionId: s.id, genieMode: 'spin360', filename: 'c.mp4', fileSizeBytes: 1000, approvalStatus: 'APPROVED' as const };
    const clip = await prisma.galleryAsset.create({ data: { ...base, assetType: 'VIDEO', url: 'https://media.boothgen.test/c.mp4', mimeType: 'video/mp4', genieKind: 'video', durationMs: 15_000, thumbnailUrl: 'https://media.boothgen.test/p.jpg' } });
    const pub = async () => ((await (await publicGallery(req('/x'), { params: Promise.resolve({ token: gallery.clientToken! }) })).json()).assets as { id: string; genieMode?: string }[]);

    // Shown by default (Video Booth messages aren't)
    expect((await pub()).map(a => a.id)).toContain(clip.id);
    await patch({ showInGallery: false });
    expect((await pub()).map(a => a.id)).not.toContain(clip.id);

    const page = await (await sessionPage(req('/x'), { params: Promise.resolve({ token: gallery.clientToken!, sessionToken: s.publicToken }) })).json();
    expect(page.assets).toEqual([expect.objectContaining({ id: clip.id, isVideoMessage: true, is360: true })]);
  });
});
