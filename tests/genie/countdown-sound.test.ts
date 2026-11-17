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
const files = new Map<string, { body: Buffer; metadata?: Record<string, string> }>();
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  getPresignedUploadUrl: vi.fn(async (key: string) => 'https://r2.test/upload/' + key),
  getR2Object: vi.fn(async (key: string) => (files.has(key) ? { body: files.get(key)!.body, contentType: null } : null)),
  headR2Object: vi.fn(async (key: string) => (files.has(key) ? { bytes: files.get(key)!.body.length, metadata: files.get(key)!.metadata } : null)),
  uploadToR2: vi.fn(async (key: string, body: Buffer, _t: string, metadata?: Record<string, string>) => { files.set(key, { body, metadata }); return BASE + key; }),
  deleteFromR2: vi.fn(async (key: string) => { files.delete(key); }),
  listR2Objects: vi.fn(async (prefix: string) => Array.from(files.entries()).filter(([k]) => k.startsWith(prefix)).map(([key, f]) => ({ key, lastModified: new Date(), bytes: f.body.length }))),
  r2PublicUrl: (key: string) => BASE + key,
  r2KeyForPublicUrl: (url: string) => (url.startsWith(BASE) ? url.slice(BASE.length) : null),
}));

import { prisma } from '@/lib/prisma/client';
import { POST as UPLOAD } from '@/app/api/genie-countdown/upload/route';
import { POST as ENCODE } from '@/app/api/genie-countdown/encode/route';
import { PATCH } from '@/app/api/events/[id]/genie/route';
import { GET as GET_DEFAULTS, PUT as PUT_DEFAULTS } from '@/app/api/genie-defaults/route';
import { GET as deviceBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { bundleValidator, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const FFMPEG = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
const p = (id: string) => ({ params: { id } });
const ev = (eventId: string) => ({ params: { eventId } });
let dir = '';
let validate: ((b: unknown) => string | null) | null = null;

function tone(name: string, seconds: number): Buffer {
  const out = path.join(dir, name);
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=880:duration=${seconds}`, '-ac', '2', out]);
  return readFileSync(out);
}

async function setup() {
  const { tenant, client } = await seedTenant();
  sessionTenantId = tenant.id;
  const event = await seedEvent(tenant.id, client.id);
  await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { customTimeZone: false, customCapture: false, customSharing: false, customPrinting: false } });
  const { token } = await seedDevice(tenant.id);
  return { tenant, event, token };
}

async function bundle(eventId: string, token: string) {
  const r = await deviceBundle(req(`/api/genie/events/${eventId}/bundle`, { token }), ev(eventId));
  expect(r.status).toBe(200);
  const b = await r.json();
  if (validate) expect(validate(b)).toBeNull();
  return b;
}

async function uploadAndEncode(contentType: string, body: Buffer, name: string) {
  const u = await UPLOAD(req('/x', { body: { contentType, bytes: body.length } }));
  expect(u.status).toBe(200);
  const { url } = await u.json();
  files.set(url.slice(BASE.length), { body });
  return ENCODE(req('/x', { body: { url, name } }));
}

// The event page sends the whole capture section; this is the countdown part on top of what's saved
async function saveCountdown(eventId: string, countdownSound: unknown) {
  const s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId } });
  const capture = {
    shotCount: s.shotCount, initialCountdownSeconds: s.initialCountdownSeconds, betweenShotsCountdownSeconds: s.betweenShotsCountdownSeconds,
    showPerShotPreview: s.showPerShotPreview, allowPerShotRetake: s.allowPerShotRetake, perShotPreviewSeconds: s.perShotPreviewSeconds,
    allowReviewRetake: s.allowReviewRetake, retakesPerShot: s.retakesPerShot, idleTimeoutSeconds: s.idleTimeoutSeconds, countdownSound,
  };
  return PATCH(req('/x', { method: 'PATCH', body: { capture } }), p(eventId));
}

beforeAll(async () => { dir = mkdtempSync(path.join(os.tmpdir(), 'countdown-test-')); validate = await bundleValidator(); });
beforeEach(async () => { await resetDb(); files.clear(); });
afterAll(async () => { rmSync(dir, { recursive: true, force: true }); await resetDb(); await prisma.$disconnect(); });

describe('Countdown sound', () => {
  it('is left out of the bundle by default ("Use the iPad\'s setting")', async () => {
    const { event, token } = await setup();
    const b = await bundle(event.id, token);
    expect(b.capture).not.toHaveProperty('countdownSound');
  });

  it('sends each built-in style, and changes the bundle version', async () => {
    const { event, token } = await setup();
    const v0 = (await bundle(event.id, token)).bundleVersion;
    for (const style of ['off', 'beeps', 'femaleVoice', 'maleVoice'] as const) {
      expect((await saveCountdown(event.id, { style, custom: null })).status).toBe(200);
      expect((await bundle(event.id, token)).capture.countdownSound).toEqual({ style });
    }
    expect((await bundle(event.id, token)).bundleVersion).toBeGreaterThan(v0);
    // Back to the iPad's setting: gone again
    await saveCountdown(event.id, { style: 'ipad', custom: null });
    expect((await bundle(event.id, token)).capture).not.toHaveProperty('countdownSound');
  });

  it('converts a custom sound once to mono AAC, at most 15 s, and sends it as an asset', async () => {
    const { event, token } = await setup();
    const r = await uploadAndEncode('audio/wav', tone('long.wav', 20), '3-2-1 smile.wav');
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.trimmed).toBe(true);
    expect(d.sound).toMatchObject({ name: '3-2-1 smile.wav' });
    expect(d.sound.durationMs).toBeGreaterThan(14_000);
    expect(d.sound.durationMs).toBeLessThanOrEqual(15_100);
    // The upload itself is gone; the encoded file is mono AAC in .m4a
    expect(Array.from(files.keys()).filter(k => k.includes('/uploads/'))).toEqual([]);
    const key = d.sound.url.slice(BASE.length);
    expect(key.endsWith('.m4a')).toBe(true);
    const probeFile = path.join(dir, 'probe.m4a');
    require('fs').writeFileSync(probeFile, files.get(key)!.body);
    let info = '';
    try { execFileSync(FFMPEG, ['-hide_banner', '-i', probeFile], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e: any) { info = e.stderr.toString(); }
    expect(info).toMatch(/Audio: aac.*44100 Hz, mono/);

    expect((await saveCountdown(event.id, { style: 'custom', custom: d.sound })).status).toBe(200);
    const b = await bundle(event.id, token);
    expect(b.capture.countdownSound).toEqual({
      style: 'custom',
      custom: { url: d.sound.url, sha256: files.get(key)!.metadata!.sha256, contentType: 'audio/mp4', bytes: files.get(key)!.body.length },
    });

    // Saving again doesn't re-encode (same file, same version)
    const v = b.bundleVersion;
    await saveCountdown(event.id, { style: 'custom', custom: d.sound });
    expect((await bundle(event.id, token)).bundleVersion).toBe(v);

    // Replacing it deletes the old file once nothing uses it
    const d2 = await (await uploadAndEncode('audio/mpeg', tone('short.mp3', 3), 'beep.mp3')).json();
    await saveCountdown(event.id, { style: 'custom', custom: d2.sound });
    expect(files.has(key)).toBe(false);
  });

  it('won\'t save "Custom sound" without a file, or a file from somewhere else', async () => {
    const { event } = await setup();
    const none = await saveCountdown(event.id, { style: 'custom', custom: null });
    expect(none.status).toBe(400);
    expect((await none.json()).error).toMatch(/Upload a custom sound/);
    const foreign = await saveCountdown(event.id, { style: 'custom', custom: { url: BASE + 'genie-countdown/someone-else/x.m4a' } });
    expect(foreign.status).toBe(400);
    expect((await UPLOAD(req('/x', { body: { contentType: 'video/mp4', bytes: 10 } }))).status).toBe(400);
    expect((await UPLOAD(req('/x', { body: { contentType: 'audio/mpeg', bytes: 21 * 1024 * 1024 } }))).status).toBe(400);
  });

  it('is an account default that events following Capture pick up', async () => {
    const { event, token } = await setup();
    const d = await (await GET_DEFAULTS()).json();
    expect(d.capture.countdownSound).toEqual({ style: 'ipad', custom: null });
    const put = await PUT_DEFAULTS(req('/x', { method: 'PUT', body: { capture: { ...d.capture, countdownSound: { style: 'femaleVoice', custom: null } } } }));
    expect(put.status).toBe(200);
    expect((await put.json()).eventsUpdated).toBe(1);
    expect((await bundle(event.id, token)).capture.countdownSound).toEqual({ style: 'femaleVoice' });
  });
});
