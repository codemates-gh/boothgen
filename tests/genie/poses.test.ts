import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
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
import { POST as UPLOAD } from '@/app/api/genie-poses/upload/route';
import { POST as PROCESS } from '@/app/api/genie-poses/process/route';
import { GET as LIBRARY } from '@/app/api/genie-poses/route';
import { DELETE as DELETE_MINE, PATCH as EDIT_MINE } from '@/app/api/genie-poses/[poseId]/route';
import { GET as SA_LIST } from '@/app/api/super-admin/poses/route';
import { DELETE as SA_DELETE, PATCH as SA_PATCH } from '@/app/api/super-admin/poses/[poseId]/route';
import { POST as SA_IMPORT } from '@/app/api/super-admin/poses/import/route';
import { GET as DASH, PATCH, POST as SET_UP } from '@/app/api/events/[id]/genie/route';
import { GET as DEFAULTS, PUT as SAVE_DEFAULTS } from '@/app/api/genie-defaults/route';
import { GET as deviceBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { sweepAbandonedPoseFiles } from '@/lib/genie/poses';
import { readImageInfo } from '@/lib/genie/image';
import { bundleValidator, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const FFMPEG = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
let dir = '';
let artPng: Buffer, photoJpeg: Buffer, opaquePng: Buffer;
const make = (name: string, args: string[]) => {
  const out = path.join(dir, name);
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  return readFileSync(out);
};

const asSuperAdmin = () => { session = { userId: 'sa', globalRole: 'SUPER_ADMIN' }; };
const asOperator = (tenantId: string) => { session = { userId: 'u1', tenantId, tenantRole: 'HOST_ADMIN' }; };
const cleanStandard = () => prisma.geniePose.deleteMany({ where: { tenantId: null } });
const p = (poseId: string) => ({ params: Promise.resolve({ poseId }) });
const ev = (id: string) => ({ params: Promise.resolve({ id }) });

type Kind = { category: 'her' | 'him' | 'all' | 'two' | 'groups'; people?: number };
async function add(body: Buffer, contentType: 'image/jpeg' | 'image/png', scope: 'mine' | 'standard', name: string, kind?: Kind, replaceId?: string) {
  const u = await UPLOAD(req('/x', { body: { scope, contentType, bytes: body.length } }));
  expect(u.status).toBe(200);
  const { url } = await u.json();
  files.set(url.slice(BASE.length), { body });
  return PROCESS(req('/x', { body: { scope, url, name, ...(kind ? { kind } : {}), ...(replaceId ? { replaceId } : {}) } }));
}
async function addOk(body: Buffer, contentType: 'image/jpeg' | 'image/png', scope: 'mine' | 'standard', name: string, kind: Kind = { category: 'her' }) {
  const r = await add(body, contentType, scope, name, kind);
  expect(r.status).toBe(201);
  return (await r.json()).pose as { id: string; category: string; people: number | null; image: { url: string; sha256: string; contentType: string }; thumbnail: { url: string; contentType: string }; width: number; height: number };
}

let tenantId = '', clientId = '';
beforeAll(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'poses-test-'));
  // A transparent illustration (stays PNG), a photo (JPEG), and an opaque PNG (becomes JPEG)
  artPng = make('art.png', ['-f', 'lavfi', '-i', 'color=c=white@0.0:size=2000x2000,format=rgba,drawbox=x=800:y=400:w=400:h=1200:color=white@1:t=fill', '-frames:v', '1']);
  photoJpeg = make('photo.jpg', ['-f', 'lavfi', '-i', 'testsrc=size=1600x2400:rate=1', '-frames:v', '1']);
  opaquePng = make('opaque.png', ['-f', 'lavfi', '-i', 'color=c=blue:size=800x600', '-frames:v', '1']);
});
afterAll(async () => { rmSync(dir, { recursive: true, force: true }); await cleanStandard(); await resetDb(); await prisma.$disconnect(); });
beforeEach(async () => {
  files.clear();
  await resetDb();
  await cleanStandard();
  const { tenant, client } = await seedTenant();
  tenantId = tenant.id; clientId = client.id;
});

describe('uploads', () => {
  it('keeps a transparent PNG as PNG, makes photos JPEG, at most 1200 px with a 360 px thumbnail, and deletes the source', async () => {
    asOperator(tenantId);
    const art = await addOk(artPng, 'image/png', 'mine', 'Arms up', { category: 'all' });
    expect([art.width, art.height, art.category]).toEqual([1200, 1200, 'all']);
    expect(art.image).toMatchObject({ contentType: 'image/png', url: `${BASE}genie-poses/${tenantId}/${art.image.sha256}.png` });
    const stored = readImageInfo(files.get(art.image.url.slice(BASE.length))!.body)!;
    expect(stored).toMatchObject({ contentType: 'image/png', width: 1200, hasAlpha: true });
    expect(readImageInfo(files.get(art.thumbnail.url.slice(BASE.length))!.body)).toMatchObject({ width: 360, height: 360 });

    const photo = await addOk(photoJpeg, 'image/jpeg', 'mine', 'Us two', { category: 'two' });
    expect([photo.width, photo.height, photo.image.contentType, photo.category, photo.people]).toEqual([800, 1200, 'image/jpeg', 'two', 2]);
    expect(readImageInfo(files.get(photo.thumbnail.url.slice(BASE.length))!.body)).toMatchObject({ contentType: 'image/jpeg', width: 240, height: 360 });
    const opaque = await addOk(opaquePng, 'image/png', 'mine', 'Band', { category: 'groups', people: 5 });
    expect([opaque.image.contentType, opaque.category, opaque.people, opaque.width]).toEqual(['image/jpeg', 'groups', 5, 800]);
    expect(Array.from(files.keys()).some(k => k.includes('/uploads/'))).toBe(false);
  });

  it('needs a category for a new pose, refuses another account’s upload, and only super admins add Standard poses', async () => {
    asOperator(tenantId);
    expect((await add(artPng, 'image/png', 'mine', 'No kind')).status).toBe(400);
    expect((await add(artPng, 'image/png', 'mine', 'Two people?', { category: 'groups', people: 2 })).status).toBe(400);
    const u = await (await UPLOAD(req('/x', { body: { scope: 'mine', contentType: 'image/png', bytes: 10 } }))).json();
    const other = await seedTenant();
    asOperator(other.tenant.id);
    expect((await PROCESS(req('/x', { body: { scope: 'mine', url: u.url, name: 'X', kind: { category: 'her' } } }))).status).toBe(422);
    expect((await UPLOAD(req('/x', { body: { scope: 'standard', contentType: 'image/png', bytes: 10 } }))).status).toBe(403);
  });
});

describe('libraries', () => {
  it('imports the 48 starter poses once, as white PNGs with the catalog hashes', async () => {
    asSuperAdmin();
    const first = await (await SA_IMPORT()).json();
    expect(first).toEqual({ poses: 48, skipped: 0 });
    expect(await (await SA_IMPORT()).json()).toEqual({ poses: 0, skipped: 48 });
    const all = (await (await SA_LIST()).json()).poses;
    const by = (c: string) => all.filter((x: any) => x.category === c).length;
    expect([by('her'), by('him'), by('all'), by('two'), by('groups')]).toEqual([12, 12, 0, 12, 12]);
    const her1 = all.find((x: any) => x.id === 'her-01');
    expect(her1.image).toMatchObject({ sha256: 'd00eef257371560020772b4823f4bbda24343ede3f7aa9dd11fd4c20b5a1f6e4', contentType: 'image/png' });
    expect(all.find((x: any) => x.id === 'groups-01').people).toBe(4);
  });

  it('Standard on/off and edits; operators see only what is on; My poses edit and delete with a warning when in use', async () => {
    asSuperAdmin();
    const on = await addOk(artPng, 'image/png', 'standard', 'Test On', { category: 'him' });
    const off = await addOk(photoJpeg, 'image/jpeg', 'standard', 'Test Off', { category: 'two' });
    await SA_PATCH(req('/x', { method: 'PATCH', body: { isActive: false } }), p(off.id));
    const edited = await (await SA_PATCH(req('/x', { method: 'PATCH', body: { name: 'Test Wave', kind: { category: 'all' } } }), p(on.id))).json();
    expect([edited.name, edited.category]).toEqual(['Test Wave', 'all']);

    asOperator(tenantId);
    const lib = await (await LIBRARY()).json();
    expect(lib.standard.map((x: any) => x.id)).toEqual([on.id]);
    const mine = await addOk(artPng, 'image/png', 'mine', 'Mine', { category: 'her' });
    expect((await (await EDIT_MINE(req('/x', { method: 'PATCH', body: { kind: { category: 'groups', people: 6 } } }), p(mine.id))).json())).toMatchObject({ category: 'groups', people: 6 });

    const event = await seedEvent(tenantId, clientId);
    await PATCH(req('/x', { method: 'PATCH', body: { poses: { enabled: true, poseIds: [mine.id, on.id] } } }), ev(event.id));
    await SAVE_DEFAULTS(req('/x', { method: 'PUT', body: { poses: { enabled: false, poseIds: [mine.id] } } }));
    const warn = await DELETE_MINE(req('/x', { method: 'DELETE' }), p(mine.id));
    expect(warn.status).toBe(409);
    expect(await warn.json()).toMatchObject({ code: 'in_use', events: 1, defaults: 1 });
    expect((await DELETE_MINE(req('/x?confirm=1', { method: 'DELETE' }), p(mine.id))).status).toBe(200);
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).poseIds).toEqual([on.id]);
    expect((await prisma.genieDefaults.findUniqueOrThrow({ where: { tenantId } })).poseIds).toEqual([]);

    // A Standard pose an event uses can't be deleted (switch it off instead)
    asSuperAdmin();
    expect((await SA_DELETE(req('/x', { method: 'DELETE' }), p(on.id))).status).toBe(409);
    expect((await SA_DELETE(req('/x', { method: 'DELETE' }), p(off.id))).status).toBe(200);
  });
});

describe('Event defaults, event override and bundle', () => {
  const bundleOf = async (eventId: string, token: string) => (await deviceBundle(req('/x', { token }), { params: { eventId } })).json();

  it('off for new accounts; defaults flow to new and following events; an event can override and go back', async () => {
    asSuperAdmin();
    await SA_IMPORT();
    asOperator(tenantId);
    const mine = await addOk(photoJpeg, 'image/jpeg', 'mine', 'Our pose', { category: 'two' });
    const { token } = await seedDevice(tenantId);

    // New accounts: off, and no poses in the bundle
    expect((await (await DEFAULTS()).json()).poses).toEqual({ enabled: false, poseIds: [] });
    const following = await seedEvent(tenantId, clientId);
    expect((await bundleOf(following.id, token)).poses).toBeUndefined();

    // Defaults on: events following them get the poses; a new event starts from them
    const saved = await SAVE_DEFAULTS(req('/x', { method: 'PUT', body: { poses: { enabled: true, poseIds: ['her-01', 'him-02', 'two-03', 'groups-04', mine.id] } } }));
    expect(saved.status).toBe(200);
    expect((await saved.json()).chosenPoses.map((x: any) => x.id)).toEqual(['her-01', 'him-02', 'two-03', 'groups-04', mine.id]);
    const b = await bundleOf(following.id, token);
    expect(b.poses.enabled).toBe(true);
    expect(b.poses.items.map((x: any) => [x.id, x.source, x.group, x.soloStyle ?? x.people])).toEqual([
      ['her-01', 'standard', 'solo', 'female'], ['him-02', 'standard', 'solo', 'male'], ['two-03', 'standard', 'group', 2],
      ['groups-04', 'standard', 'group', 4], [mine.id, 'account', 'group', 2],
    ]);
    expect(b.poses.items[0]).toMatchObject({ image: { contentType: 'image/png' }, thumbnail: { contentType: 'image/png' } });
    expect(b.poses.items[0]).not.toHaveProperty('people');
    const validate = await bundleValidator();
    if (validate) expect(validate(b)).toBeNull();

    const fresh = await seedEvent(tenantId, clientId, { settings: false });
    await SET_UP(req('/x', { body: {} }), ev(fresh.id));
    const d = await (await DASH(req('/x'), ev(fresh.id))).json();
    expect(d.settings.poses).toEqual({ enabled: true, poseIds: ['her-01', 'him-02', 'two-03', 'groups-04', mine.id] });
    expect(d.settings.custom.poses).toBe(false);
    expect(d.chosenPoses.map((x: any) => x.category)).toEqual(['her', 'him', 'two', 'groups', 'two']);

    // Override on one event: its own list, marked custom, and later default changes leave it alone
    const own = await (await PATCH(req('/x', { method: 'PATCH', body: { poses: { enabled: true, poseIds: ['him-02', 'her-01'] } } }), ev(fresh.id))).json();
    expect([own.poses.poseIds, own.custom.poses]).toEqual([['him-02', 'her-01'], true]);
    await SAVE_DEFAULTS(req('/x', { method: 'PUT', body: { poses: { enabled: true, poseIds: ['groups-01'] } } }));
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: fresh.id } })).poseIds).toEqual(['him-02', 'her-01']);
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: following.id } })).poseIds).toEqual(['groups-01']);
    // Back to the defaults
    const reset = await (await PATCH(req('/x', { method: 'PATCH', body: { reset: ['poses'] } }), ev(fresh.id))).json();
    expect([reset.poses, reset.custom.poses]).toEqual([{ enabled: true, poseIds: ['groups-01'] }, false]);
    // Saving the same as the defaults isn't an override
    const same = await (await PATCH(req('/x', { method: 'PATCH', body: { poses: { enabled: true, poseIds: ['groups-01'] } } }), ev(fresh.id))).json();
    expect(same.custom.poses).toBe(false);

    // Off on the event (overriding defaults that are on): no poses in its bundle
    await PATCH(req('/x', { method: 'PATCH', body: { poses: { enabled: false, poseIds: ['groups-01'] } } }), ev(following.id));
    expect((await bundleOf(following.id, token)).poses).toBeUndefined();
  });

  it('on with nothing chosen sends nothing; switched-off Standard poses stay where chosen but cannot be newly chosen', async () => {
    asSuperAdmin();
    await SA_IMPORT();
    asOperator(tenantId);
    const event = await seedEvent(tenantId, clientId);
    const { token } = await seedDevice(tenantId);
    await PATCH(req('/x', { method: 'PATCH', body: { poses: { enabled: true, poseIds: [] } } }), ev(event.id));
    expect((await bundleOf(event.id, token)).poses).toBeUndefined();
    await PATCH(req('/x', { method: 'PATCH', body: { poses: { enabled: true, poseIds: ['her-03'] } } }), ev(event.id));
    const v1 = (await bundleOf(event.id, token)).bundleVersion;

    asSuperAdmin();
    await SA_PATCH(req('/x', { method: 'PATCH', body: { isActive: false } }), p('her-03'));
    asOperator(tenantId);
    const d = await (await DASH(req('/x'), ev(event.id))).json();
    expect(d.chosenPoses.map((x: any) => [x.id, x.isActive])).toEqual([['her-03', false]]);
    expect((await bundleOf(event.id, token)).poses.items.map((x: any) => x.id)).toEqual(['her-03']);
    expect((await PATCH(req('/x', { method: 'PATCH', body: { poses: { enabled: true, poseIds: ['her-03', 'her-04'] } } }), ev(event.id))).status).toBe(200);
    const other = await seedEvent(tenantId, clientId);
    const refused = await PATCH(req('/x', { method: 'PATCH', body: { poses: { enabled: true, poseIds: ['her-03'] } } }), ev(other.id));
    expect(refused.status).toBe(400);
    expect((await refused.json()).path).toBe('poses');
    // A replaced picture changes the bundle version
    asSuperAdmin();
    await add(artPng, 'image/png', 'standard', 'Hand on hip waving', undefined, 'her-04');
    expect((await bundleOf(event.id, token)).bundleVersion).toBeGreaterThan(v1);
  });
});

describe('sweep', () => {
  it('sweeps old unprocessed sources and unsaved files, keeps used ones', async () => {
    asOperator(tenantId);
    const x = await addOk(artPng, 'image/png', 'mine', 'Used');
    const old = new Date(Date.now() - 25 * 3600_000);
    for (const k of Array.from(files.keys())) files.set(k, { ...files.get(k)!, at: old });
    files.set(`genie-poses/${tenantId}/uploads/x.png`, { body: artPng, at: new Date(Date.now() - 7 * 3600_000) });
    files.set(`genie-poses/${tenantId}/${'f'.repeat(64)}.png`, { body: artPng, at: old });
    files.set(`genie-poses/${tenantId}/${'e'.repeat(64)}.png`, { body: artPng });
    expect(await sweepAbandonedPoseFiles()).toEqual({ sources: 1, unsaved: 1 });
    expect(files.has(x.image.url.slice(BASE.length))).toBe(true);
  });
});
