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
  getR2Object: vi.fn(async (key: string) => (files.has(key) ? { body: files.get(key)!.body, contentType: null } : null)),
  headR2Object: vi.fn(async (key: string) => (files.has(key) ? { bytes: files.get(key)!.body.length } : null)),
  uploadToR2: vi.fn(async (key: string, body: Buffer) => { files.set(key, { body }); return BASE + key; }),
  deleteFromR2: vi.fn(async (key: string) => { files.delete(key); }),
  listR2Objects: vi.fn(async (prefix: string) => Array.from(files.entries()).filter(([k]) => k.startsWith(prefix)).map(([key, f]) => ({ key, lastModified: f.at ?? new Date(), bytes: f.body.length }))),
  r2PublicUrl: (key: string) => BASE + key,
  r2KeyForPublicUrl: (url: string) => (url.startsWith(BASE) ? url.slice(BASE.length) : null),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { POST as UPLOAD } from '@/app/api/genie-props/upload/route';
import { GET as LIBRARY, POST as CREATE_MINE } from '@/app/api/genie-props/route';
import { DELETE as DELETE_MINE, PATCH as EDIT_MINE } from '@/app/api/genie-props/[propId]/route';
import { GET as SA_LIST, POST as SA_CREATE } from '@/app/api/super-admin/props/route';
import { DELETE as SA_DELETE, PATCH as SA_PATCH } from '@/app/api/super-admin/props/[propId]/route';
import { POST as CAT_CREATE } from '@/app/api/super-admin/prop-categories/route';
import { DELETE as CAT_DELETE } from '@/app/api/super-admin/prop-categories/[categoryId]/route';
import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { GET as deviceBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { importStarterProps, sweepAbandonedPropImages } from '@/lib/genie/props';
import { bundleValidator, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const FFMPEG = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg');
let dir = '';
let transparentPng: Buffer, opaquePng: Buffer, otherPng: Buffer;

function make(name: string, args: string[]): Buffer {
  const out = path.join(dir, name);
  execFileSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  return readFileSync(out);
}

// Categories and Standard props the tests create are prefixed so they can be cleaned up in the shared dev DB
const CAT = 'test-cat', SUB = 'test-sub', SUB2 = 'test-sub-2';
async function cleanStandard() {
  await prisma.genieProp.deleteMany({ where: { tenantId: null, OR: [{ id: { startsWith: 'test-' } }, { category: CAT }] } });
  await prisma.geniePropCategory.deleteMany({ where: { OR: [{ id: { startsWith: 'test-' } }, { parentId: { startsWith: 'test-' } }] } });
}

const asSuperAdmin = () => { session = { userId: 'sa', globalRole: 'SUPER_ADMIN' }; };
const asOperator = (tenantId: string) => { session = { userId: 'u1', tenantId, tenantRole: 'HOST_ADMIN' }; };

function uploadReq(body: Buffer, scope: 'mine' | 'standard') {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(body)], { type: 'image/png' }), 'prop.png');
  form.append('scope', scope);
  return new NextRequest('https://boothgen.test/x', { method: 'POST', body: form });
}

async function upload(body: Buffer, scope: 'mine' | 'standard') {
  const r = await UPLOAD(uploadReq(body, scope));
  expect(r.status).toBe(200);
  return (await r.json()) as { image: { url: string; sha256: string; bytes: number }; width: number; height: number };
}

const propBody = (imageUrl: string, over: Record<string, unknown> = {}) => ({
  name: 'Party Shades', category: CAT, subcategory: SUB, imageUrl,
  size: { width: 900, height: 380 }, anchor: 'eyes', anchorPoint: { x: 450, y: 190 }, ...over,
});

let tenantId = '', clientId = '';

beforeAll(async () => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'props-test-'));
  transparentPng = make('t.png', ['-f', 'lavfi', '-i', 'color=c=red@0.5:size=200x100,format=rgba', '-frames:v', '1']);
  otherPng = make('t2.png', ['-f', 'lavfi', '-i', 'color=c=blue@0.5:size=120x120,format=rgba', '-frames:v', '1']);
  opaquePng = make('o.png', ['-f', 'lavfi', '-i', 'color=c=red:size=200x100,format=rgb24', '-frames:v', '1']);
});
afterAll(async () => { rmSync(dir, { recursive: true, force: true }); await cleanStandard(); await resetDb(); });

beforeEach(async () => {
  files.clear();
  await resetDb();
  await cleanStandard();
  await prisma.geniePropCategory.createMany({ data: [
    { id: CAT, name: 'Test', parentId: null }, { id: SUB, name: 'Test sub', parentId: CAT }, { id: SUB2, name: 'Test sub 2', parentId: CAT },
  ] });
  const { tenant, client } = await seedTenant();
  tenantId = tenant.id; clientId = client.id;
});

async function standardProp(id: string, over: Partial<{ isActive: boolean }> = {}) {
  asSuperAdmin();
  const { image } = await upload(id.endsWith('2') ? otherPng : transparentPng, 'standard');
  const r = await SA_CREATE(req('/x', { body: propBody(image.url, { name: id }) }));
  expect(r.status).toBe(201);
  const p = await r.json();
  // Fixed test ids so they're easy to clean up
  await prisma.genieProp.update({ where: { id: p.id }, data: { id, ...over } });
  return id;
}

describe('prop uploads', () => {
  it('stores a transparent PNG content-addressed and refuses opaque or non-PNG files', async () => {
    asOperator(tenantId);
    const a = await upload(transparentPng, 'mine');
    expect(a.width).toBe(200);
    expect(a.image.url).toBe(`${BASE}genie-props/${tenantId}/${a.image.sha256}.png`);
    // Same file, same address
    expect((await upload(transparentPng, 'mine')).image.url).toBe(a.image.url);

    const opaque = await UPLOAD(uploadReq(opaquePng, 'mine'));
    expect(opaque.status).toBe(422);
    expect((await opaque.json()).error).toMatch(/transparent/);
    const big = await UPLOAD(uploadReq(Buffer.alloc(2 * 1024 * 1024 + 1), 'mine'));
    expect(big.status).toBe(422);
  });

  it('only super admins upload Standard art', async () => {
    asOperator(tenantId);
    expect((await UPLOAD(uploadReq(transparentPng, 'standard'))).status).toBe(403);
  });
});

describe('Standard props (Super Admin)', () => {
  it('creates, switches off and deletes; operators only see props that are on', async () => {
    const on = await standardProp('test-on');
    const off = await standardProp('test-off2', { isActive: false });
    asSuperAdmin();
    const list = await (await SA_LIST()).json();
    expect(list.props.map((p: any) => p.id)).toEqual(expect.arrayContaining([on, off]));
    expect(list.categories.find((c: any) => c.id === CAT).subcategories.map((s: any) => s.id)).toEqual([SUB, SUB2]);

    asOperator(tenantId);
    const lib = await (await LIBRARY()).json();
    expect(lib.standard.map((p: any) => p.id)).toContain(on);
    expect(lib.standard.map((p: any) => p.id)).not.toContain(off);

    asSuperAdmin();
    const r = await SA_PATCH(req('/x', { method: 'PATCH', body: { isActive: false } }), { params: { propId: on } });
    expect((await r.json()).isActive).toBe(false);
    expect((await SA_DELETE(req('/x', { method: 'DELETE' }), { params: { propId: on } })).status).toBe(200);
  });

  it('refuses a sub-category that is not under the category', async () => {
    asSuperAdmin();
    const { image } = await upload(transparentPng, 'standard');
    const r = await SA_CREATE(req('/x', { body: propBody(image.url, { subcategory: 'nope' }) }));
    expect(r.status).toBe(422);
  });

  it('replacing the PNG deletes the old file when nothing else uses it', async () => {
    const id = await standardProp('test-replace');
    const before = await prisma.genieProp.findUniqueOrThrow({ where: { id } });
    const oldKey = (before.image as any).url.slice(BASE.length);
    asSuperAdmin();
    const { image } = await upload(otherPng, 'standard');
    const r = await SA_PATCH(req('/x', { method: 'PATCH', body: propBody(image.url, { name: 'Replaced' }) }), { params: { propId: id } });
    expect(r.status).toBe(200);
    expect(files.has(oldKey)).toBe(false);
    expect(files.has(image.url.slice(BASE.length))).toBe(true);
  });

  it('categories: add a sub-category, and only empty ones can be deleted', async () => {
    asSuperAdmin();
    const c = await (await CAT_CREATE(req('/x', { body: { name: 'Test Sub 3', parentId: CAT } }))).json();
    expect(c.id).toBe('test-sub-3');
    await standardProp('test-in-sub');
    expect((await CAT_DELETE(req('/x', { method: 'DELETE' }), { params: { categoryId: SUB } })).status).toBe(409);
    expect((await CAT_DELETE(req('/x', { method: 'DELETE' }), { params: { categoryId: CAT } })).status).toBe(409);
    expect((await CAT_DELETE(req('/x', { method: 'DELETE' }), { params: { categoryId: 'test-sub-3' } })).status).toBe(200);
  });

  it('operators cannot reach the Super Admin routes', async () => {
    asOperator(tenantId);
    expect((await SA_LIST()).status).toBe(401);
  });
});

describe('My props', () => {
  it('creates, edits and deletes the account’s own props; other accounts never see them', async () => {
    asOperator(tenantId);
    const { image } = await upload(transparentPng, 'mine');
    const created = await CREATE_MINE(req('/x', { body: propBody(image.url, { anchor: 'chin', anchorPoint: { x: 450, y: -20 } }) }));
    expect(created.status).toBe(201);
    const prop = await created.json();
    expect(prop.source).toBe('account');
    expect(prop.anchorPoint).toEqual({ x: 450, y: -20 });

    const edited = await EDIT_MINE(req('/x', { method: 'PATCH', body: propBody(image.url, { name: 'Renamed' }) }), { params: { propId: prop.id } });
    expect((await edited.json()).name).toBe('Renamed');

    const other = await seedTenant();
    asOperator(other.tenant.id);
    expect((await (await LIBRARY()).json()).mine).toEqual([]);
    expect((await EDIT_MINE(req('/x', { method: 'PATCH', body: propBody(image.url) }), { params: { propId: prop.id } })).status).toBe(404);
    // Another account's upload can't be used
    expect((await CREATE_MINE(req('/x', { body: propBody(image.url) }))).status).toBe(422);

    asOperator(tenantId);
    expect((await DELETE_MINE(req('/x', { method: 'DELETE' }), { params: { propId: prop.id } })).status).toBe(200);
    expect(files.has(image.url.slice(BASE.length))).toBe(false);
  });
});

describe('event props and the bundle', () => {
  async function eventWithDevice() {
    const event = await seedEvent(tenantId, clientId);
    const { token } = await seedDevice(tenantId);
    return { event, token };
  }
  const bundleOf = async (eventId: string, token: string) => (await deviceBundle(req('/x', { token }), { params: { eventId } })).json();

  it('off by default: no props in the bundle', async () => {
    const { event, token } = await eventWithDevice();
    asOperator(tenantId);
    const d = await (await DASH(req('/x'), { params: { id: event.id } })).json();
    expect(d.settings.props).toEqual({ enabled: false, propIds: [] });
    expect((await bundleOf(event.id, token)).props).toBeUndefined();
  });

  it('sends the chosen props in order, valid against the Genie schema, and bumps the version when a prop file changes', async () => {
    const a = await standardProp('test-a');
    const b = await standardProp('test-b2');
    asOperator(tenantId);
    const { image } = await upload(transparentPng, 'mine');
    const mine = (await (await CREATE_MINE(req('/x', { body: propBody(image.url, { name: 'Mine', anchor: 'mouth' }) }))).json()).id;

    const { event, token } = await eventWithDevice();
    // On with nothing chosen: still absent
    await PATCH(req('/x', { method: 'PATCH', body: { props: { enabled: true, propIds: [] } } }), { params: { id: event.id } });
    expect((await bundleOf(event.id, token)).props).toBeUndefined();

    const r = await PATCH(req('/x', { method: 'PATCH', body: { props: { enabled: true, propIds: [mine, b, a, b] } } }), { params: { id: event.id } });
    expect(r.status).toBe(200);
    expect((await r.json()).props).toEqual({ enabled: true, propIds: [mine, b, a] });

    const bundle = await bundleOf(event.id, token);
    expect(bundle.props.enabled).toBe(true);
    expect(bundle.props.items.map((p: any) => [p.id, p.source])).toEqual([[mine, 'account'], [b, 'standard'], [a, 'standard']]);
    expect(bundle.props.items[2]).toMatchObject({ anchor: 'eyes', anchorPoint: { x: 450, y: 190 }, size: { width: 900, height: 380 }, eyeDistance: 300, image: { contentType: 'image/png' } });
    const validate = await bundleValidator();
    if (validate) expect(validate(bundle)).toBeNull();

    // Super Admin replaces a chosen prop's PNG: the bundle changes version
    asSuperAdmin();
    const { image: newArt } = await upload(otherPng, 'standard');
    await SA_PATCH(req('/x', { method: 'PATCH', body: propBody(newArt.url, { name: 'test-a' }) }), { params: { propId: a } });
    const after = await bundleOf(event.id, token);
    expect(after.bundleVersion).toBe(bundle.bundleVersion + 1);
    expect(after.props.items[2].image.sha256).toBe(newArt.sha256);
  });

  it('a switched-off Standard prop stays on events that chose it but cannot be newly chosen', async () => {
    const a = await standardProp('test-keep');
    const { event, token } = await eventWithDevice();
    asOperator(tenantId);
    await PATCH(req('/x', { method: 'PATCH', body: { props: { enabled: true, propIds: [a] } } }), { params: { id: event.id } });
    asSuperAdmin();
    await SA_PATCH(req('/x', { method: 'PATCH', body: { isActive: false } }), { params: { propId: a } });
    // In use: Super Admin can't delete it
    expect((await SA_DELETE(req('/x', { method: 'DELETE' }), { params: { propId: a } })).status).toBe(409);

    expect((await bundleOf(event.id, token)).props.items.map((p: any) => p.id)).toEqual([a]);
    asOperator(tenantId);
    const d = await (await DASH(req('/x'), { params: { id: event.id } })).json();
    expect(d.chosenProps.map((p: any) => [p.id, p.isActive])).toEqual([[a, false]]);
    // Saving the event again with it kept is fine
    expect((await PATCH(req('/x', { method: 'PATCH', body: { props: { enabled: true, propIds: [a] } } }), { params: { id: event.id } })).status).toBe(200);

    const other = await seedEvent(tenantId, clientId);
    const r = await PATCH(req('/x', { method: 'PATCH', body: { props: { enabled: true, propIds: [a] } } }), { params: { id: other.id } });
    expect(r.status).toBe(400);
  });

  it('refuses another account’s props and blocks deleting a My prop an event offers', async () => {
    const other = await seedTenant();
    asOperator(other.tenant.id);
    const { image } = await upload(transparentPng, 'mine');
    const theirs = (await (await CREATE_MINE(req('/x', { body: propBody(image.url) }))).json()).id;
    const theirEvent = await seedEvent(other.tenant.id, other.client.id);
    await PATCH(req('/x', { method: 'PATCH', body: { props: { enabled: true, propIds: [theirs] } } }), { params: { id: theirEvent.id } });
    expect((await DELETE_MINE(req('/x', { method: 'DELETE' }), { params: { propId: theirs } })).status).toBe(409);

    asOperator(tenantId);
    const { event } = await eventWithDevice();
    expect((await PATCH(req('/x', { method: 'PATCH', body: { props: { enabled: true, propIds: [theirs] } } }), { params: { id: event.id } })).status).toBe(400);
  });
});

describe('starter import and cleanup', () => {
  it('imports the catalog once and leaves existing props alone', async () => {
    const src = path.join(dir, 'starter');
    mkdirSync(path.join(src, 'png'), { recursive: true });
    writeFileSync(path.join(src, 'png', 'a.png'), transparentPng);
    writeFileSync(path.join(src, 'png', 'b.png'), otherPng);
    writeFileSync(path.join(src, 'catalog.json'), JSON.stringify({
      categories: [{ id: 'test-imp', name: 'Imported', subcategories: [{ id: 'test-imp-sub', name: 'Sub' }] }],
      props: [
        { id: 'test-imp-a', name: 'A', category: 'test-imp', subcategory: 'test-imp-sub', alsoIn: [{ category: CAT, subcategory: SUB }], png: 'png/a.png', size: { width: 900, height: 380 }, anchor: 'eyes', anchorPoint: [450, 190], eyeDistance: 300 },
        { id: 'test-imp-b', name: 'B', category: 'test-imp', subcategory: 'test-imp-sub', png: 'png/b.png', size: { width: 600, height: 600 }, anchor: 'chin', anchorPoint: [300, 20], eyeDistance: 300 },
      ],
    }));
    expect(await importStarterProps(src)).toEqual({ categories: 2, props: 2, skipped: 0 });
    await prisma.genieProp.update({ where: { id: 'test-imp-a' }, data: { name: 'Edited' } });
    expect(await importStarterProps(src)).toEqual({ categories: 0, props: 0, skipped: 2 });
    const a = await prisma.genieProp.findUniqueOrThrow({ where: { id: 'test-imp-a' } });
    expect(a.name).toBe('Edited');
    expect([a.anchorX, a.anchorY]).toEqual([450, 190]);
  });

  it('sweeps uploads older than a day that no prop uses', async () => {
    const used = await standardProp('test-used');
    const usedKey = ((await prisma.genieProp.findUniqueOrThrow({ where: { id: used } })).image as any).url.slice(BASE.length);
    const old = new Date(Date.now() - 25 * 3600_000);
    files.set(usedKey, { ...files.get(usedKey)!, at: old });
    files.set('genie-props/standard/' + 'f'.repeat(64) + '.png', { body: transparentPng, at: old });
    files.set('genie-props/standard/' + 'e'.repeat(64) + '.png', { body: transparentPng });
    files.set('genie-attract/x/old.mp4', { body: transparentPng, at: old });
    expect(await sweepAbandonedPropImages()).toBe(1);
    expect(files.has(usedKey)).toBe(true);
    expect(files.has('genie-props/standard/' + 'e'.repeat(64) + '.png')).toBe(true);
    expect(files.has('genie-attract/x/old.mp4')).toBe(true);
  });
});
