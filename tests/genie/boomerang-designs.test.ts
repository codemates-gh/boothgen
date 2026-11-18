import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

let session: Record<string, unknown> = {};
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', ...session })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({})) }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));

// Designer uploads (bytes) in a fake R2
const BASE = 'https://media.boothgen.test/';
const files = new Map<string, Buffer>();
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  getR2Object: vi.fn(async (key: string) => (files.has(key) ? { body: files.get(key)! } : null)),
  deleteFromR2: vi.fn(async (key: string) => { files.delete(key); }),
  r2PublicUrl: (key: string) => BASE + key,
  r2KeyForPublicUrl: (url: string) => (url.startsWith(BASE) ? url.slice(BASE.length) : null),
}));

import { prisma } from '@/lib/prisma/client';
import { GET as deviceBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { GET as LIST, POST as CREATE } from '@/app/api/genie-clip-designs/route';
import { DELETE as REMOVE, PATCH as SWITCH, PUT as SAVE } from '@/app/api/genie-clip-designs/[designId]/route';
import { BOOMERANG_FORMATS } from '@/lib/genie/schemas';
import { CLIP_CANVAS } from '@/lib/genie/clipDesigns';
import { bundleValidator, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const ev = (eventId: string) => ({ params: Promise.resolve({ eventId }) });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const d = (designId: string) => ({ params: Promise.resolve({ designId }) });

// Minimal PNG (header only: signature + IHDR; colour type 6 = RGBA, 2 = RGB) and JPEG (SOF0) files
function png(width: number, height: number, alpha = true): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(width, 16); b.writeUInt32BE(height, 20); b[24] = 8; b[25] = alpha ? 6 : 2;
  return b;
}
function jpeg(width: number, height: number): Buffer {
  const b = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
  b.writeUInt16BE(height, 7); b.writeUInt16BE(width, 9);
  return b;
}
function stored(folder: string, buf: Buffer, ext: 'png' | 'jpg') {
  const key = `genie-templates/${folder}/${randomUUID()}.${ext}`;
  files.set(key, buf);
  const url = BASE + key;
  return { url, sha256: 'a'.repeat(64), contentType: ext === 'png' ? 'image/png' : 'image/jpeg', bytes: buf.length };
}

const BOOMERANG = { enabled: true, format: 'square', frameCount: 12, playbackSpeed: 'fast', reverse: true, superSpeedCapture: false, showOverlayOnLiveView: true, mirrorLiveView: true };
const slotIn = (format: keyof typeof CLIP_CANVAS) => {
  const c = CLIP_CANVAS[format];
  return { id: 'clip', shotIndex: 0, x: 60, y: 80, width: c.widthPx - 120, height: c.heightPx - 300, rotationDegrees: 0, fit: 'fill' };
};

async function setup() {
  const { tenant, client } = await seedTenant();
  session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN' };
  const event = await seedEvent(tenant.id, client.id);
  const { token } = await seedDevice(tenant.id);
  const bundle = async () => (await deviceBundle(req('/x', { token }), ev(event.id))).json();
  const patch = (b: Record<string, unknown>) => PATCH(req('/x', { method: 'PATCH', body: { boomerang: { ...BOOMERANG, ...b } } }), p(event.id));
  return { tenant, event, bundle, patch };
}

async function create(body: Record<string, unknown>) {
  return CREATE(req('/x', { body }));
}

let validate: Awaited<ReturnType<typeof bundleValidator>>;
const valid = (b: unknown) => { if (validate) expect(validate(b)).toBeNull(); };

beforeEach(async () => {
  await resetDb(); files.clear();
  await prisma.genieClipDesign.deleteMany({ where: { tenantId: null, name: { startsWith: 'Test ' } } });
  validate ??= await bundleValidator();
});
afterAll(async () => { await resetDb(); await prisma.genieClipDesign.deleteMany({ where: { tenantId: null, name: { startsWith: 'Test ' } } }); await prisma.$disconnect(); });

describe('Boomerang shapes', () => {
  it.each(BOOMERANG_FORMATS)('sends the %s shape as a plain clip (no design)', async format => {
    const { bundle, patch } = await setup();
    expect((await patch({ format })).status).toBe(200);
    const b = await bundle();
    expect(b.capture.boomerang.format).toBe(format);
    expect(b.capture.boomerang).not.toHaveProperty('design');
    valid(b);
  });
});

describe('Boomerang designs in the bundle', () => {
  it('sends no design for a plain clip, and keeps an overlay from before designs', async () => {
    const { tenant, bundle, patch } = await setup();
    const overlay = stored(tenant.id, png(1080, 1080), 'png');
    expect((await patch({ overlayUrl: overlay.url })).status).toBe(200);
    const b = await bundle();
    expect(b.capture.boomerang).not.toHaveProperty('design');
    expect(b.capture.boomerang.overlay.url).toBe(overlay.url);
    valid(b);
  });

  it('sends a Standard design with its images (sha256 and bytes), and a new version after every edit', async () => {
    const { tenant, event, bundle, patch } = await setup();
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', globalRole: 'SUPER_ADMIN' };
    const background = stored('standard', jpeg(1080, 1920), 'jpg');
    const overlay = stored('standard', png(1080, 1920), 'png');
    const r = await create({ name: 'Test Stories', scope: 'standard', isActive: true, format: 'portrait9x16', backgroundColor: '#112233', background, overlay, slot: slotIn('portrait9x16') });
    expect(r.status).toBe(201);
    const design = await r.json();
    expect(design).toMatchObject({ scope: 'standard', version: 1, isActive: true });
    expect(design.overlay.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(design.overlay.bytes).toBe(33);

    // Operators see it at its shape
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN' };
    expect((await (await LIST()).json()).standard.map((x: any) => x.id)).toContain(design.id);

    expect((await patch({ format: 'portrait9x16', design: { source: 'clip', id: design.id } })).status).toBe(200);
    const b = await bundle();
    expect(b.capture.boomerang.design).toEqual({
      id: design.id, name: 'Test Stories', version: 1, format: 'portrait9x16', backgroundColor: '#112233',
      background: design.background, overlay: design.overlay, slot: slotIn('portrait9x16'),
    });
    valid(b);

    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', globalRole: 'SUPER_ADMIN' };
    const saved = await (await SAVE(req('/x', { method: 'PUT', body: { name: 'Test Stories', format: 'portrait9x16', backgroundColor: '#000000', background, overlay, slot: slotIn('portrait9x16') } }), d(design.id))).json();
    expect(saved.version).toBe(2);
    const b2 = await bundle();
    expect(b2.capture.boomerang.design).toMatchObject({ version: 2, backgroundColor: '#000000' });
    expect(b2.bundleVersion).toBe(b.bundleVersion + 1);

    // Switched off: no longer offered, but an event that chose it keeps it
    expect((await SWITCH(req('/x', { method: 'PATCH', body: { isActive: false } }), d(design.id))).status).toBe(200);
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN' };
    expect((await (await LIST()).json()).standard.map((x: any) => x.id)).not.toContain(design.id);
    expect((await bundle()).capture.boomerang.design.id).toBe(design.id);
    void event;
  });

  it('sends a My design made in the designer', async () => {
    const { tenant, bundle, patch } = await setup();
    const background = stored(tenant.id, jpeg(1440, 1080), 'jpg');
    const r = await create({ name: 'Gold frame', format: 'landscape4x3', backgroundColor: '#ffffff', background, slot: { ...slotIn('landscape4x3'), fit: 'fit', rotationDegrees: -4 } });
    expect(r.status).toBe(201);
    const design = await r.json();
    expect(design).toMatchObject({ scope: 'mine', source: 'designer', backgroundColor: '#FFFFFF' });
    expect((await (await LIST()).json()).mine.map((x: any) => x.id)).toEqual([design.id]);

    expect((await patch({ format: 'landscape4x3', design: { source: 'clip', id: design.id } })).status).toBe(200);
    const b = await bundle();
    expect(b.capture.boomerang.design).toMatchObject({ id: design.id, format: 'landscape4x3', background: design.background, slot: { fit: 'fit', rotationDegrees: -4, shotIndex: 0 } });
    expect(b.capture.boomerang.design).not.toHaveProperty('overlay');
    expect(b.capture.boomerang.design).not.toHaveProperty('thumbnail');
    valid(b);
  });

  it('sends an uploaded PNG frame as a design: the PNG as overlay, its window as the slot', async () => {
    const { tenant, event, bundle, patch } = await setup();
    // Chosen before: a plain overlay. Choosing the frame replaces it.
    await patch({ format: 'portrait3x4', overlayUrl: stored(tenant.id, png(1080, 1440), 'png').url });
    const overlay = stored(tenant.id, png(2160, 2880), 'png');
    const window = { id: 'window', shotIndex: 0, x: 90, y: 120, width: 900, height: 1000, rotationDegrees: 0, fit: 'fill' };
    const r = await create({ name: 'Uploaded frame', source: 'upload', format: 'portrait3x4', backgroundColor: '#FFFFFF', overlay, slot: window });
    expect(r.status).toBe(201);
    const design = await r.json();
    expect(design.source).toBe('upload');

    expect((await patch({ format: 'portrait3x4', design: { source: 'clip', id: design.id } })).status).toBe(200);
    const b = await bundle();
    expect(b.capture.boomerang).not.toHaveProperty('overlay');
    expect(b.capture.boomerang.design).toMatchObject({ overlay: { url: overlay.url, contentType: 'image/png' }, slot: window, format: 'portrait3x4' });
    valid(b);
    const dash = await (await DASH(req('/x'), p(event.id))).json();
    expect(dash.settings.boomerang).toMatchObject({ design: { source: 'clip', id: design.id }, designProblem: null, overlay: null });
  });

  it('sends a single-photo 4x6 print design with its slot scaled to the clip', async () => {
    const { tenant, bundle, patch } = await setup();
    const overlay = stored(tenant.id, png(1200, 1800), 'png');
    const t = await prisma.boothDesignTemplate.create({
      data: {
        tenantId: tenant.id, name: 'Single photo', format: '4x6', orientation: 'portrait', photoCount: 1,
        layout: { format: '4x6', orientation: 'portrait', widthPx: 1200, heightPx: 1800, dpi: 300, backgroundColor: '#ffeedd', overlay, slots: [{ id: 's1', shotIndex: 0, x: 100, y: 200, width: 1000, height: 1200, rotationDegrees: 0, fit: 'fill' }] },
      },
    });
    const lib = await (await LIST()).json();
    expect(lib.print).toEqual([expect.objectContaining({ id: t.id, format: 'portrait4x6' })]);

    // Only at its 4x6 shape
    expect((await patch({ format: 'landscape6x4', design: { source: 'print', id: t.id } })).status).toBe(400);
    expect((await patch({ format: 'portrait4x6', design: { source: 'print', id: t.id } })).status).toBe(200);
    const b = await bundle();
    expect(b.capture.boomerang.design).toMatchObject({
      id: t.id, format: 'portrait4x6', backgroundColor: '#FFEEDD', overlay,
      slot: { id: 's1', shotIndex: 0, x: 90, y: 180, width: 900, height: 1080, rotationDegrees: 0, fit: 'fill' },
    });
    expect(b.capture.boomerang.design.version).toBeGreaterThan(1);
    valid(b);
  });

  it('drops the design when its shape no longer matches or it was deleted, and tells the editor', async () => {
    const { tenant, event, bundle, patch } = await setup();
    const design = await (await create({ name: 'Square frame', format: 'square', backgroundColor: '#FFFFFF', slot: slotIn('square') })).json();
    expect((await patch({ design: { source: 'clip', id: design.id } })).status).toBe(200);
    expect((await bundle()).capture.boomerang.design.id).toBe(design.id);

    // The event's shape can't change under a chosen design
    const wrong = await patch({ format: 'portrait9x16' });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).path).toBe('boomerang.design');
    // A design at another shape can't be chosen
    const other = await (await create({ name: 'Tall', format: 'portrait9x16', backgroundColor: '#FFFFFF', slot: slotIn('portrait9x16') })).json();
    expect((await patch({ design: { source: 'clip', id: other.id } })).status).toBe(400);

    // The design itself changes shape: dropped from the bundle, notice in the editor
    await SAVE(req('/x', { method: 'PUT', body: { name: 'Square frame', format: 'portrait3x4', backgroundColor: '#FFFFFF', slot: slotIn('portrait3x4') } }), d(design.id));
    let b = await bundle();
    expect(b.capture.boomerang).not.toHaveProperty('design');
    expect(b.capture.boomerang.format).toBe('square');
    valid(b);
    expect((await (await DASH(req('/x'), p(event.id))).json()).settings.boomerang.designProblem).toBe('shape');

    // Deleted: dropped too
    await SAVE(req('/x', { method: 'PUT', body: { name: 'Square frame', format: 'square', backgroundColor: '#FFFFFF', slot: slotIn('square') } }), d(design.id));
    expect((await bundle()).capture.boomerang.design.version).toBe(3);
    expect((await REMOVE(req('/x', { method: 'DELETE' }), d(design.id))).status).toBe(200);
    b = await bundle();
    expect(b.capture.boomerang).not.toHaveProperty('design');
    expect((await (await DASH(req('/x'), p(event.id))).json()).settings.boomerang.designProblem).toBe('deleted');

    // Clearing the choice
    expect((await patch({ design: null })).status).toBe(200);
    expect((await (await DASH(req('/x'), p(event.id))).json()).settings.boomerang).toMatchObject({ design: null, designProblem: null });
    void tenant;
  });
});

describe('Boomerang design checks', () => {
  it('refuses images in the wrong shape, an overlay without transparency, a slot past the edge, and other accounts\' designs', async () => {
    const { tenant, patch } = await setup();
    const base = { name: 'X', format: 'square', backgroundColor: '#FFFFFF', slot: slotIn('square') };
    expect((await create({ ...base, overlay: stored(tenant.id, png(1080, 1920), 'png') })).status).toBe(422);
    expect((await create({ ...base, overlay: stored(tenant.id, png(1080, 1080, false), 'png') })).status).toBe(422);
    expect((await create({ ...base, overlay: stored(tenant.id, jpeg(1080, 1080), 'jpg') })).status).toBe(422);
    expect((await create({ ...base, background: stored('someone-else', jpeg(1080, 1080), 'jpg') })).status).toBe(422);
    expect((await create({ ...base, slot: { ...slotIn('square'), x: 600, width: 600 } })).status).toBe(400);
    expect((await create({ ...base, slot: { ...slotIn('square'), width: 10 } })).status).toBe(400);
    expect((await create({ ...base, source: 'upload' })).status).toBe(400);
    expect((await create({ ...base, scope: 'standard' })).status).toBe(403);

    const { tenant: t2 } = await seedTenant();
    session = { tenantId: t2.id, tenantRole: 'HOST_ADMIN' };
    const theirs = await (await create(base)).json();
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN' };
    expect((await patch({ design: { source: 'clip', id: theirs.id } })).status).toBe(400);
    expect((await REMOVE(req('/x', { method: 'DELETE' }), d(theirs.id))).status).toBe(404);
  });
});
