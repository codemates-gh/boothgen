import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';

let session: Record<string, unknown> = {};
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => session) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));

const BASE = 'https://media.boothgen.test/';
const files = new Map<string, { body: Buffer; at?: Date }>();
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  getPresignedUploadUrl: vi.fn(async (key: string) => 'https://r2.test/upload/' + key),
  getR2Object: vi.fn(async (key: string) => (files.has(key) ? { body: files.get(key)!.body, contentType: null } : null)),
  headR2Object: vi.fn(async (key: string) => (files.has(key) ? { bytes: files.get(key)!.body.length } : null)),
  uploadToR2: vi.fn(async (key: string, body: Buffer) => { files.set(key, { body }); return BASE + key; }),
  deleteFromR2: vi.fn(async (key: string) => { files.delete(key); }),
  listR2Objects: vi.fn(async (prefix: string) => Array.from(files.entries()).filter(([k]) => k.startsWith(prefix)).map(([key, f]) => ({ key, lastModified: f.at ?? new Date(), bytes: f.body.length }))),
  r2PublicUrl: (key: string) => BASE + key,
  r2KeyForPublicUrl: (url: string) => (url.startsWith(BASE) ? url.slice(BASE.length) : null),
}));

import { prisma } from '@/lib/prisma/client';
import { POST as UPLOAD } from '@/app/api/genie-backdrops/upload/route';
import { POST as PROCESS } from '@/app/api/genie-backdrops/process/route';
import { GET as LIBRARY } from '@/app/api/genie-backdrops/route';
import { DELETE as DELETE_MINE, PATCH as RENAME_MINE } from '@/app/api/genie-backdrops/[backdropId]/route';
import { GET as SA_LIST } from '@/app/api/super-admin/backdrops/route';
import { DELETE as SA_DELETE, PATCH as SA_PATCH } from '@/app/api/super-admin/backdrops/[backdropId]/route';
import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { GET as deviceBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { importStarterBackdrops, sweepAbandonedBackdropFiles } from '@/lib/genie/backdrops';
import { readImageInfo } from '@/lib/genie/image';
import { bundleValidator, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const FFMPEG = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
let dir = '';
let bigJpeg: Buffer, smallJpeg: Buffer, transparentPng: Buffer, otherJpeg: Buffer;
const make = (name: string, args: string[]) => {
  const out = path.join(dir, name);
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  return readFileSync(out);
};
// Pixel colour at (x, y) of a JPEG, via ffmpeg
function pixel(jpeg: Buffer, x: number, y: number): number[] {
  const f = path.join(dir, 'px-' + Math.random().toString(36).slice(2) + '.jpg');
  writeFileSync(f, jpeg);
  const raw = execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-i', f, '-vf', `crop=2:2:${x}:${y}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return Array.from(raw.subarray(0, 3));
}

const asSuperAdmin = () => { session = { userId: 'sa', globalRole: 'SUPER_ADMIN' }; };
const asOperator = (tenantId: string) => { session = { userId: 'u1', tenantId, tenantRole: 'HOST_ADMIN' }; };
const cleanStandard = () => prisma.genieBackdrop.deleteMany({ where: { tenantId: null, OR: [{ id: { startsWith: 'test-' } }, { name: { startsWith: 'Test ' } }] } });

// Presign, "PUT", then process, like the editor does
async function add(body: Buffer, contentType: 'image/jpeg' | 'image/png', scope: 'mine' | 'standard', name: string, replaceId?: string) {
  const u = await UPLOAD(req('/x', { body: { scope, contentType, bytes: body.length } }));
  expect(u.status).toBe(200);
  const { url } = await u.json();
  files.set(url.slice(BASE.length), { body });
  return PROCESS(req('/x', { body: { scope, url, name, ...(replaceId ? { replaceId } : {}) } }));
}
async function addOk(body: Buffer, contentType: 'image/jpeg' | 'image/png', scope: 'mine' | 'standard', name: string) {
  const r = await add(body, contentType, scope, name);
  expect(r.status).toBe(201);
  return (await r.json()).backdrop as { id: string; image: { url: string; sha256: string }; thumbnail: { url: string }; width: number; height: number };
}

let tenantId = '', clientId = '';
beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'backdrops-test-'));
  bigJpeg = make('big.jpg', ['-f', 'lavfi', '-i', 'testsrc=size=3000x2000:rate=1', '-frames:v', '1']);
  otherJpeg = make('other.jpg', ['-f', 'lavfi', '-i', 'color=c=blue:size=1800x1200', '-frames:v', '1']);
  smallJpeg = make('small.jpg', ['-f', 'lavfi', '-i', 'color=c=green:size=900x600', '-frames:v', '1']);
  // Fully transparent red: flattened onto white it must come out white
  transparentPng = make('t.png', ['-f', 'lavfi', '-i', 'color=c=red@0.0:size=1600x1000,format=rgba', '-frames:v', '1']);
});
afterAll(async () => { rmSync(dir, { recursive: true, force: true }); await cleanStandard(); await resetDb(); });
beforeEach(async () => {
  files.clear();
  await resetDb();
  await cleanStandard();
  const { tenant, client } = await seedTenant();
  tenantId = tenant.id; clientId = client.id;
});

describe('uploads', () => {
  it('scales a big photo to 1800 px, stores a JPEG and a 360 px thumbnail content-addressed, and deletes the source', async () => {
    asOperator(tenantId);
    const b = await addOk(bigJpeg, 'image/jpeg', 'mine', 'Big');
    expect([b.width, b.height]).toEqual([1800, 1200]);
    expect(b.image.url).toBe(`${BASE}genie-backdrops/${tenantId}/${b.image.sha256}.jpg`);
    const stored = files.get(b.image.url.slice(BASE.length))!.body;
    expect(readImageInfo(stored)).toMatchObject({ contentType: 'image/jpeg', width: 1800, height: 1200 });
    expect(readImageInfo(files.get(b.thumbnail.url.slice(BASE.length))!.body)).toMatchObject({ width: 360, height: 240 });
    expect(Array.from(files.keys()).some(k => k.includes('/uploads/'))).toBe(false);
  });

  it('flattens PNG transparency onto white, and warns (not blocks) for small pictures', async () => {
    asOperator(tenantId);
    const png = await addOk(transparentPng, 'image/png', 'mine', 'Clear');
    const [r, g, bl] = pixel(files.get(png.image.url.slice(BASE.length))!.body, 100, 100);
    expect(Math.min(r, g, bl)).toBeGreaterThan(240);

    const small = await add(smallJpeg, 'image/jpeg', 'mine', 'Small');
    expect(small.status).toBe(201);
    const d = await small.json();
    expect(d.backdrop.width).toBe(900);
    expect(d.warning).toMatch(/soft/);
  });

  it('refuses another account’s upload and lets only super admins add Standard backdrops', async () => {
    asOperator(tenantId);
    const u = await (await UPLOAD(req('/x', { body: { scope: 'mine', contentType: 'image/jpeg', bytes: 10 } }))).json();
    const other = await seedTenant();
    asOperator(other.tenant.id);
    expect((await PROCESS(req('/x', { body: { scope: 'mine', url: u.url, name: 'X' } }))).status).toBe(422);
    expect((await UPLOAD(req('/x', { body: { scope: 'standard', contentType: 'image/jpeg', bytes: 10 } }))).status).toBe(403);
  });
});

describe('libraries', () => {
  it('Standard on/off, rename, replace, delete; operators see only what is on', async () => {
    asSuperAdmin();
    const on = await addOk(otherJpeg, 'image/jpeg', 'standard', 'Test On');
    const off = await addOk(bigJpeg, 'image/jpeg', 'standard', 'Test Off');
    await SA_PATCH(req('/x', { method: 'PATCH', body: { isActive: false } }), { params: { backdropId: off.id } });
    expect((await (await SA_LIST()).json()).backdrops.map((b: any) => b.id)).toEqual(expect.arrayContaining([on.id, off.id]));

    asOperator(tenantId);
    const lib = await (await LIBRARY()).json();
    expect(lib.standard.map((b: any) => b.id)).toContain(on.id);
    expect(lib.standard.map((b: any) => b.id)).not.toContain(off.id);

    asSuperAdmin();
    expect((await (await SA_PATCH(req('/x', { method: 'PATCH', body: { name: 'Test Renamed' } }), { params: { backdropId: on.id } })).json()).name).toBe('Test Renamed');
    const oldKey = on.image.url.slice(BASE.length);
    const replaced = await add(smallJpeg, 'image/jpeg', 'standard', 'Test Renamed', on.id);
    expect(replaced.status).toBe(200);
    expect((await replaced.json()).backdrop.id).toBe(on.id);
    expect(files.has(oldKey)).toBe(false);
    expect((await SA_DELETE(req('/x', { method: 'DELETE' }), { params: { backdropId: off.id } })).status).toBe(200);
  });

  it('My backdrops: rename, and deleting one an event uses warns first, then takes it off the event', async () => {
    asOperator(tenantId);
    const a = await addOk(otherJpeg, 'image/jpeg', 'mine', 'A');
    const b = await addOk(bigJpeg, 'image/jpeg', 'mine', 'B');
    expect((await (await RENAME_MINE(req('/x', { method: 'PATCH', body: { name: 'Renamed' } }), { params: { backdropId: a.id } })).json()).name).toBe('Renamed');

    const event = await seedEvent(tenantId, clientId);
    await PATCH(req('/x', { method: 'PATCH', body: { backgroundRemoval: { enabled: true, backdropIds: [a.id, b.id], defaultId: a.id, guestPicks: true, edgeSoftness: 'medium' } } }), { params: { id: event.id } });
    const warn = await DELETE_MINE(req('/x', { method: 'DELETE' }), { params: { backdropId: a.id } });
    expect(warn.status).toBe(409);
    expect((await warn.json()).events).toBe(1);
    expect((await DELETE_MINE(req('/x?confirm=1', { method: 'DELETE' }), { params: { backdropId: a.id } })).status).toBe(200);
    const s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(s.backdropIds).toEqual([b.id]);
    expect(s.backdropDefaultId).toBeNull();
  });
});

describe('event and bundle', () => {
  const bundleOf = async (eventId: string, token: string) => (await deviceBundle(req('/x', { token }), { params: { eventId } })).json();

  it('off by default; on sends backgroundRemoval in order, valid against the Genie schema, and a replaced file bumps the version', async () => {
    asSuperAdmin();
    const std = await addOk(otherJpeg, 'image/jpeg', 'standard', 'Test Std');
    asOperator(tenantId);
    const mine = await addOk(bigJpeg, 'image/jpeg', 'mine', 'Mine');
    const event = await seedEvent(tenantId, clientId);
    const { token } = await seedDevice(tenantId);

    const d = await (await DASH(req('/x'), { params: { id: event.id } })).json();
    expect(d.settings.backgroundRemoval).toEqual({ enabled: false, backdropIds: [], defaultId: null, guestPicks: true, edgeSoftness: 'medium' });
    expect((await bundleOf(event.id, token)).backgroundRemoval).toBeUndefined();

    // On with nothing chosen: still absent
    await PATCH(req('/x', { method: 'PATCH', body: { backgroundRemoval: { enabled: true, backdropIds: [], defaultId: null, guestPicks: true, edgeSoftness: 'medium' } } }), { params: { id: event.id } });
    expect((await bundleOf(event.id, token)).backgroundRemoval).toBeUndefined();

    const r = await PATCH(req('/x', { method: 'PATCH', body: { backgroundRemoval: { enabled: true, backdropIds: [mine.id, std.id], defaultId: std.id, guestPicks: false, edgeSoftness: 'soft' } } }), { params: { id: event.id } });
    expect(r.status).toBe(200);
    const bundle = await bundleOf(event.id, token);
    expect(bundle.backgroundRemoval).toMatchObject({ enabled: true, guestPicks: false, defaultId: std.id, edgeSoftness: 'soft' });
    expect(bundle.backgroundRemoval.items.map((b: any) => [b.id, b.source])).toEqual([[mine.id, 'account'], [std.id, 'standard']]);
    expect(bundle.backgroundRemoval.items[0]).toMatchObject({ image: { contentType: 'image/jpeg' }, thumbnail: { contentType: 'image/jpeg' } });
    const validate = await bundleValidator();
    if (validate) expect(validate(bundle)).toBeNull();

    asSuperAdmin();
    await add(smallJpeg, 'image/jpeg', 'standard', 'Test Std', std.id);
    const after = await bundleOf(event.id, token);
    expect(after.bundleVersion).toBe(bundle.bundleVersion + 1);
  });

  it('a default that is not chosen is dropped; switched-off Standard backdrops stay but cannot be newly chosen', async () => {
    asSuperAdmin();
    const std = await addOk(otherJpeg, 'image/jpeg', 'standard', 'Test Keep');
    asOperator(tenantId);
    const event = await seedEvent(tenantId, clientId);
    const r = await PATCH(req('/x', { method: 'PATCH', body: { backgroundRemoval: { enabled: true, backdropIds: [std.id], defaultId: 'nope', guestPicks: true, edgeSoftness: 'sharp' } } }), { params: { id: event.id } });
    expect((await r.json()).backgroundRemoval.defaultId).toBeNull();

    asSuperAdmin();
    await SA_PATCH(req('/x', { method: 'PATCH', body: { isActive: false } }), { params: { backdropId: std.id } });
    expect((await SA_DELETE(req('/x', { method: 'DELETE' }), { params: { backdropId: std.id } })).status).toBe(409);
    asOperator(tenantId);
    const d = await (await DASH(req('/x'), { params: { id: event.id } })).json();
    expect(d.chosenBackdrops.map((b: any) => [b.id, b.isActive])).toEqual([[std.id, false]]);
    expect((await PATCH(req('/x', { method: 'PATCH', body: { backgroundRemoval: { enabled: true, backdropIds: [std.id], defaultId: null, guestPicks: true, edgeSoftness: 'sharp' } } }), { params: { id: event.id } })).status).toBe(200);
    const other = await seedEvent(tenantId, clientId);
    expect((await PATCH(req('/x', { method: 'PATCH', body: { backgroundRemoval: { enabled: true, backdropIds: [std.id], defaultId: null, guestPicks: true, edgeSoftness: 'sharp' } } }), { params: { id: other.id } })).status).toBe(400);
  });
});

describe('starter import and sweep', () => {
  it('imports the catalog once', async () => {
    const src = path.join(dir, 'starter');
    mkdirSync(path.join(src, 'jpg'), { recursive: true });
    mkdirSync(path.join(src, 'thumb'), { recursive: true });
    writeFileSync(path.join(src, 'jpg', 'a.jpg'), otherJpeg);
    writeFileSync(path.join(src, 'thumb', 'a.jpg'), smallJpeg);
    writeFileSync(path.join(src, 'catalog.json'), JSON.stringify({ backdrops: [{ id: 'test-a', name: 'Test A', jpg: 'jpg/a.jpg', thumbnail: 'thumb/a.jpg', size: { width: 1800, height: 1200 } }] }));
    expect(await importStarterBackdrops(src)).toEqual({ backdrops: 1, skipped: 0 });
    expect(await importStarterBackdrops(src)).toEqual({ backdrops: 0, skipped: 1 });
  });

  it('sweeps old unprocessed sources and unsaved files, keeps used ones', async () => {
    asOperator(tenantId);
    const b = await addOk(otherJpeg, 'image/jpeg', 'mine', 'Used');
    const old = new Date(Date.now() - 25 * 3600_000);
    for (const k of Array.from(files.keys())) files.set(k, { ...files.get(k)!, at: old });
    files.set(`genie-backdrops/${tenantId}/uploads/x.jpg`, { body: smallJpeg, at: new Date(Date.now() - 7 * 3600_000) });
    files.set(`genie-backdrops/${tenantId}/${'f'.repeat(64)}.jpg`, { body: smallJpeg, at: old });
    files.set(`genie-backdrops/${tenantId}/${'e'.repeat(64)}.jpg`, { body: smallJpeg });
    expect(await sweepAbandonedBackdropFiles()).toEqual({ sources: 1, unsaved: 1 });
    expect(files.has(b.image.url.slice(BASE.length))).toBe(true);
    expect(files.has(b.thumbnail.url.slice(BASE.length))).toBe(true);
  });
});
