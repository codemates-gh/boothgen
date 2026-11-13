import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));

// In-memory R2: bytes plus custom metadata
const BASE = 'https://media.boothgen.test/';
const files = new Map<string, { body: Buffer; metadata?: Record<string, string>; at?: Date }>();
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  getPresignedUploadUrl: vi.fn(async (key: string) => 'https://r2.test/upload/' + key),
  getR2Object: vi.fn(async (key: string) => (files.has(key) ? { body: files.get(key)!.body, contentType: null } : null)),
  headR2Object: vi.fn(async (key: string) => (files.has(key) ? { bytes: files.get(key)!.body.length, metadata: files.get(key)!.metadata } : null)),
  uploadToR2: vi.fn(async (key: string, body: Buffer, _t: string, metadata?: Record<string, string>) => { files.set(key, { body, metadata }); return BASE + key; }),
  deleteFromR2: vi.fn(async (key: string) => { files.delete(key); }),
  listR2Objects: vi.fn(async (prefix: string) => Array.from(files.entries()).filter(([k]) => k.startsWith(prefix)).map(([key, f]) => ({ key, lastModified: f.at ?? new Date(), bytes: f.body.length }))),
  r2PublicUrl: (key: string) => BASE + key,
  r2KeyForPublicUrl: (url: string) => (url.startsWith(BASE) ? url.slice(BASE.length) : null),
}));

import { prisma } from '@/lib/prisma/client';
import { POST as UPLOAD } from '@/app/api/genie-attract/upload/route';
import { POST as ENCODE } from '@/app/api/genie-attract/encode/route';
import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { GET as GET_DEFAULTS, PUT as PUT_DEFAULTS } from '@/app/api/genie-defaults/route';
import { GET as deviceBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { sweepAbandonedAttractFiles } from '@/lib/genie/attract';
import { attractVideoGate } from '@/lib/genie/attractGate';
import { bundleValidator, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const FFMPEG = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
const p = (id: string) => ({ params: { id } });
const ev = (eventId: string) => ({ params: { eventId } });
let dir = '';

// Test media made with ffmpeg
function make(name: string, args: string[]): Buffer {
  const out = path.join(dir, name);
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  return readFileSync(out);
}

// A JPEG with an EXIF orientation tag (6 = rotate 90° clockwise to display)
function withOrientation(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.from([0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0, 2 + 6 + tiff.length]), Buffer.from('Exif\0\0', 'latin1'), tiff]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

function probe(buf: Buffer) {
  const f = path.join(dir, 'probe-' + Math.random().toString(36).slice(2));
  require('fs').writeFileSync(f, buf);
  let err = '';
  try { execFileSync(FFMPEG, ['-hide_banner', '-i', f], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e: any) { err = e.stderr.toString(); }
  return err;
}

async function setup() {
  const { tenant, client } = await seedTenant();
  sessionTenantId = tenant.id;
  const event = await seedEvent(tenant.id, client.id);
  // seedEvent's settings predate defaults; make the event follow them like a newly set-up one
  await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { customTimeZone: false, customCapture: false, customSharing: false, customPrinting: false } });
  const { token } = await seedDevice(tenant.id);
  return { tenant, client, event, token };
}

// Upload (presign + "PUT") then encode, like the editor does
async function uploadAndEncode(contentType: string, body: Buffer) {
  const u = await UPLOAD(req('/x', { body: { contentType, bytes: body.length } }));
  expect(u.status).toBe(200);
  const { url } = await u.json();
  files.set(url.slice(BASE.length), { body });
  return ENCODE(req('/x', { body: { url } }));
}

let landscapePng: Buffer, rotatedJpeg: Buffer, video4k: Buffer, longVideo: Buffer, tooLongVideo: Buffer;

beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'attract-test-'));
  landscapePng = make('big.png', ['-f', 'lavfi', '-i', 'testsrc=size=4000x2250:rate=1', '-frames:v', '1']);
  rotatedJpeg = withOrientation(make('small.jpg', ['-f', 'lavfi', '-i', 'testsrc=size=400x300:rate=1', '-frames:v', '1']), 6);
  // 2 s of 4K at 60 fps with a sound track
  video4k = make('4k.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=3840x2160:rate=60', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest']);
  // 35 s, small, so the encoder has to keep only the first 30
  longVideo = make('long.mov', ['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=10', '-t', '35', '-c:v', 'libx264', '-preset', 'ultrafast']);
  // Over the one-minute gate
  tooLongVideo = make('toolong.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5', '-t', '75', '-c:v', 'libx264', '-preset', 'ultrafast']);
}, 120_000);

beforeEach(async () => { await resetDb(); files.clear(); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); rmSync(dir, { recursive: true, force: true }); });

describe('Attract screen uploads', () => {
  it('shrinks a large image to a JPEG at most 2048 px wide, stores it with its metadata and deletes the source', async () => {
    const { tenant } = await setup();
    const r = await uploadAndEncode('image/png', landscapePng);
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.media).toMatchObject({ kind: 'image', width: 2048, height: 1152, durationMs: null });
    expect(d.media.url).toMatch(new RegExp(`^${BASE}genie-attract/${tenant.id}/[0-9a-f-]+\\.jpg$`));
    expect(d.media.bytes).toBeLessThanOrEqual(1024 * 1024);
    const stored = files.get(d.media.url.slice(BASE.length))!;
    expect(stored.body.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(stored.metadata).toMatchObject({ kind: 'image', width: '2048', height: '1152', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(Array.from(files.keys()).filter(k => k.includes('/uploads/'))).toEqual([]);
  });

  it('turns a phone photo the way its EXIF orientation says', async () => {
    await setup();
    const d = await (await uploadAndEncode('image/jpeg', rotatedJpeg)).json();
    expect(d.media).toMatchObject({ width: 300, height: 400 });
  });

  it('re-encodes video to H.264 at most 1080 on the short side, 30 fps, no sound, faststart', async () => {
    await setup();
    const r = await uploadAndEncode('video/mp4', video4k);
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.media).toMatchObject({ kind: 'video', width: 1920, height: 1080 });
    expect(d.media.durationMs).toBeGreaterThan(1900);
    expect(d.trimmed).toBe(false);
    const out = files.get(d.media.url.slice(BASE.length))!.body;
    const info = probe(out);
    expect(info).toMatch(/Video: h264/);
    expect(info).toMatch(/ 30 fps/);
    expect(info).not.toMatch(/Audio:/);
    // faststart: the moov box comes before the media data
    expect(out.indexOf('moov')).toBeLessThan(out.indexOf('mdat'));
  }, 60_000);

  it('keeps only the first 30 seconds of a longer video and says so', async () => {
    await setup();
    const d = await (await uploadAndEncode('video/quicktime', longVideo)).json();
    expect(d.trimmed).toBe(true);
    expect(d.media.durationMs).toBeGreaterThan(29_000);
    expect(d.media.durationMs).toBeLessThanOrEqual(30_100);
  }, 60_000);

  it('refuses the wrong type, files over the size limits, and anything that is not a picture', async () => {
    await setup();
    const presign = (body: unknown) => UPLOAD(req('/x', { body }));
    expect((await presign({ contentType: 'image/gif', bytes: 100 })).status).toBe(400);
    expect((await presign({ contentType: 'image/jpeg', bytes: 21 * 1024 * 1024 })).status).toBe(400);
    expect((await presign({ contentType: 'video/mp4', bytes: 201 * 1024 * 1024 })).status).toBe(400);
    expect((await presign({ contentType: 'video/mp4', bytes: 150 * 1024 * 1024 })).status).toBe(200);
    const r = await uploadAndEncode('video/mp4', Buffer.from('not a video at all'));
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/couldn't be read/);
    // Only this account's uploads can be encoded
    expect((await ENCODE(req('/x', { body: { url: BASE + 'genie-attract/someone-else/uploads/x.mp4' } }))).status).toBe(422);
  });
});

describe('Attract screen gate on large videos', () => {
  it('lets a minute-long 4K video through and stops longer or bigger ones', () => {
    expect(attractVideoGate(10_400, 1536, 2048)).toBeNull();
    expect(attractVideoGate(60_000, 3840, 2160)).toBeNull();
    expect(attractVideoGate(null, 1920, 1080)).toBeNull();
    expect(attractVideoGate(75_000, 1920, 1080)).toMatch(/75 seconds long.*under a minute/);
    expect(attractVideoGate(20_000, 7680, 4320)).toMatch(/7680×4320.*4K or smaller/);
  });

  it('the server refuses a video over a minute and deletes the upload', async () => {
    const { tenant } = await setup();
    const r = await uploadAndEncode('video/mp4', tooLongVideo);
    expect(r.status).toBe(422);
    expect((await r.json()).error).toMatch(/75 seconds long/);
    expect(Array.from(files.keys()).filter(k => k.startsWith(`genie-attract/${tenant.id}/`))).toEqual([]);
  }, 60_000);
});

describe('Attract screen cleanup of abandoned files', () => {
  it('deletes old unencoded uploads and old encoded files nobody saved; keeps saved and recent ones', async () => {
    const { tenant, event } = await setup();
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
    const saved = (await (await uploadAndEncode('image/jpeg', rotatedJpeg)).json()).media;
    await PATCH(req('/x', { method: 'PATCH', body: { attract: { mediaUrl: saved.url, returnAfterSeconds: 30 } } }), p(event.id));
    const unsavedOld = (await (await uploadAndEncode('image/jpeg', rotatedJpeg)).json()).media;
    const unsavedNew = (await (await uploadAndEncode('image/jpeg', rotatedJpeg)).json()).media;
    const key = (u: string) => u.slice(BASE.length);
    files.get(key(saved.url))!.at = hoursAgo(48);
    files.get(key(unsavedOld.url))!.at = hoursAgo(48);
    files.get(key(unsavedNew.url))!.at = hoursAgo(2);
    const up = `genie-attract/${tenant.id}/uploads/`;
    files.set(up + 'old.mp4', { body: Buffer.from('x'), at: hoursAgo(7) });
    files.set(up + 'new.mp4', { body: Buffer.from('x'), at: hoursAgo(1) });
    // Something else in the bucket is never touched
    files.set('genie-templates/x.png', { body: Buffer.from('x'), at: hoursAgo(100) });

    expect(await sweepAbandonedAttractFiles()).toEqual({ sources: 1, unsaved: 1 });
    expect(files.has(key(saved.url))).toBe(true);
    expect(files.has(key(unsavedOld.url))).toBe(false);
    expect(files.has(key(unsavedNew.url))).toBe(true);
    expect(files.has(up + 'old.mp4')).toBe(false);
    expect(files.has(up + 'new.mp4')).toBe(true);
    expect(files.has('genie-templates/x.png')).toBe(true);
  }, 60_000);
});

describe('Attract screen settings and bundle', () => {
  it('is absent until set; saving media puts it in the bundle (valid against the Genie schema) and bumps the version once', async () => {
    const { event, token } = await setup();
    const b0 = await (await deviceBundle(req('/x', { token }), ev(event.id))).json();
    expect(b0.attract).toBeUndefined();
    const dash = await (await DASH(req('/x'), p(event.id))).json();
    expect(dash.settings.attract).toEqual({ media: null, returnAfterSeconds: 30 });

    const media = (await (await uploadAndEncode('image/png', landscapePng)).json()).media;
    const r = await PATCH(req('/x', { method: 'PATCH', body: { attract: { mediaUrl: media.url, returnAfterSeconds: 45 } } }), p(event.id));
    expect(r.status).toBe(200);
    const view = await r.json();
    expect(view.attract).toEqual({ media, returnAfterSeconds: 45 });
    expect(view.custom.attract).toBe(true);

    const b1 = await (await deviceBundle(req('/x', { token }), ev(event.id))).json();
    expect(b1.bundleVersion).toBe(b0.bundleVersion + 1);
    expect(b1.attract).toEqual({ media: { url: media.url, sha256: expect.stringMatching(/^[0-9a-f]{64}$/), contentType: 'image/jpeg', bytes: media.bytes }, returnAfterSeconds: 45 });
    const validate = await bundleValidator();
    if (validate) expect(validate(b1)).toBeNull();

    // Saving the same file again (and other sections) changes nothing the iPad downloads
    await PATCH(req('/x', { method: 'PATCH', body: { attract: { mediaUrl: media.url, returnAfterSeconds: 45 }, timeZone: 'America/Los_Angeles' } }), p(event.id));
    expect((await (await deviceBundle(req('/x', { token }), ev(event.id))).json()).bundleVersion).toBe(b1.bundleVersion);

    // Removing it takes it out of the bundle and deletes the file nothing else uses
    await PATCH(req('/x', { method: 'PATCH', body: { attract: { mediaUrl: null, returnAfterSeconds: 45 } } }), p(event.id));
    const b2 = await (await deviceBundle(req('/x', { token }), ev(event.id))).json();
    expect(b2.attract).toBeUndefined();
    expect(files.has(media.url.slice(BASE.length))).toBe(false);
  });

  it('only accepts encoded files from this account', async () => {
    const { tenant, event } = await setup();
    const patch = (mediaUrl: string, returnAfterSeconds = 30) => PATCH(req('/x', { method: 'PATCH', body: { attract: { mediaUrl, returnAfterSeconds } } }), p(event.id));
    files.set(`genie-attract/${tenant.id}/uploads/raw.mp4`, { body: Buffer.from('x') });
    expect((await patch(BASE + `genie-attract/${tenant.id}/uploads/raw.mp4`)).status).toBe(400);
    expect((await patch(BASE + 'genie-attract/other-tenant/a.jpg')).status).toBe(400);
    expect((await patch(BASE + `genie-attract/${tenant.id}/missing.jpg`)).status).toBe(400);
    const media = (await (await uploadAndEncode('image/png', landscapePng)).json()).media;
    expect((await patch(media.url, 4)).status).toBe(400);
    expect((await patch(media.url, 601)).status).toBe(400);
  });

  it('is an account default: events that follow it get the file, custom events keep theirs, and the old default file is cleaned up', async () => {
    const { tenant, client, event, token } = await setup();
    const custom = await seedEvent(tenant.id, client.id);
    const own = (await (await uploadAndEncode('image/jpeg', rotatedJpeg)).json()).media;
    await PATCH(req('/x', { method: 'PATCH', body: { attract: { mediaUrl: own.url, returnAfterSeconds: 20 } } }), p(custom.id));

    const first = (await (await uploadAndEncode('image/png', landscapePng)).json()).media;
    const put = await PUT_DEFAULTS(req('/x', { method: 'PUT', body: { attract: { mediaUrl: first.url, returnAfterSeconds: 60 } } }));
    expect(put.status).toBe(200);
    expect((await put.json()).attract).toEqual({ media: first, returnAfterSeconds: 60 });
    expect((await (await GET_DEFAULTS()).json()).attract.media.url).toBe(first.url);

    const b = await (await deviceBundle(req('/x', { token }), ev(event.id))).json();
    expect(b.attract).toMatchObject({ media: { url: first.url }, returnAfterSeconds: 60 });
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: custom.id } })).attract).toMatchObject({ media: { url: own.url } });

    // A new default file replaces the old one on following events; the old file is then unused and deleted
    const second = (await (await uploadAndEncode('video/mp4', video4k)).json()).media;
    await PUT_DEFAULTS(req('/x', { method: 'PUT', body: { attract: { mediaUrl: second.url, returnAfterSeconds: 60 } } }));
    expect((await (await deviceBundle(req('/x', { token }), ev(event.id))).json()).attract.media).toMatchObject({ url: second.url, contentType: 'video/mp4' });
    expect(files.has(first.url.slice(BASE.length))).toBe(false);
    expect(files.has(own.url.slice(BASE.length))).toBe(true);

    // "Use default" puts the custom event back on the default file
    await PATCH(req('/x', { method: 'PATCH', body: { reset: ['attract'] } }), p(custom.id));
    const s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: custom.id } });
    expect(s).toMatchObject({ customAttract: false, attractReturnAfterSeconds: 60, attract: { media: { url: second.url } } });
    expect(files.has(own.url.slice(BASE.length))).toBe(false);
  }, 60_000);
});
