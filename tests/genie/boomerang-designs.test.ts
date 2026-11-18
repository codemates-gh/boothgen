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
import { POST as ADD_TO_EVENT } from '@/app/api/events/[id]/genie/templates/route';
import { GET as LIBRARY, POST as CREATE_TEMPLATE } from '@/app/api/genie-templates/route';
import { BOOMERANG_FORMATS } from '@/lib/genie/schemas';
import { clientTemplates } from '@/lib/templates/clientLibrary';
import { bundleValidator, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

// Boomerang uses single-photo templates from the same library as photos. Square, 9:16 and 16:9 templates are
// Boomerang & GIF only; 4x6 single-photo templates work for both.

const ev = (eventId: string) => ({ params: Promise.resolve({ eventId }) });
const p = (id: string) => ({ params: Promise.resolve({ id }) });

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
const slot = (x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}) => ({ id: 's1', shotIndex: 0, x, y, width, height, rotationDegrees: 0, fit: 'fill', ...extra });
const layout = (format: string, orientation: string, widthPx: number, heightPx: number, slots: unknown[], extra: Record<string, unknown> = {}) =>
  ({ format, orientation, widthPx, heightPx, dpi: 300, backgroundColor: '#FFFFFF', slots, ...extra });

async function setup() {
  const { tenant, client } = await seedTenant();
  session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN' };
  const event = await seedEvent(tenant.id, client.id);
  const { token } = await seedDevice(tenant.id);
  const bundle = async () => (await deviceBundle(req('/x', { token }), ev(event.id))).json();
  const patch = (b: Record<string, unknown>) => PATCH(req('/x', { method: 'PATCH', body: { boomerang: { ...BOOMERANG, ...b } } }), p(event.id));
  const template = (data: Record<string, unknown>) => prisma.boothDesignTemplate.create({ data: { tenantId: tenant.id, photoCount: 1, ...data } as any });
  return { tenant, event, bundle, patch, template };
}

let validate: Awaited<ReturnType<typeof bundleValidator>>;
const valid = (b: unknown) => { if (validate) expect(validate(b)).toBeNull(); };

beforeEach(async () => {
  await resetDb(); files.clear();
  await prisma.boothDesignTemplate.deleteMany({ where: { tenantId: null, name: { startsWith: 'Test ' } } });
  validate ??= await bundleValidator();
});
afterAll(async () => { await resetDb(); await prisma.boothDesignTemplate.deleteMany({ where: { tenantId: null, name: { startsWith: 'Test ' } } }); await prisma.$disconnect(); });

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

describe('Boomerang templates in the bundle', () => {
  it('sends no design for a plain clip, and keeps an overlay from before templates', async () => {
    const { tenant, bundle, patch } = await setup();
    const overlay = stored(tenant.id, png(1080, 1080), 'png');
    expect((await patch({ overlayUrl: overlay.url })).status).toBe(200);
    const b = await bundle();
    expect(b.capture.boomerang).not.toHaveProperty('design');
    expect(b.capture.boomerang.overlay.url).toBe(overlay.url);
    valid(b);
  });

  it('sends a Standard square template (border and full frame) as the design, and a new version after an edit', async () => {
    const { bundle, patch } = await setup();
    const thumb = stored('standard', jpeg(540, 540), 'jpg');
    const border = await prisma.boothDesignTemplate.create({ data: { tenantId: null, name: 'Test Square with Border', format: 'square', orientation: 'portrait', photoCount: 1, isPublished: true, genieThumbnail: thumb, layout: layout('square', 'portrait', 1080, 1080, [slot(54, 54, 972, 972)]) } });
    const full = await prisma.boothDesignTemplate.create({ data: { tenantId: null, name: 'Test Square Full Frame', format: 'square', orientation: 'portrait', photoCount: 1, isPublished: true, layout: layout('square', 'portrait', 1080, 1080, [slot(0, 0, 1080, 1080)]) } });
    const lib = await (await LIBRARY()).json();
    expect(lib.standard.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([border.id, full.id]));

    expect((await patch({ format: 'square', design: { source: 'print', id: border.id } })).status).toBe(200);
    const b = await bundle();
    expect(b.capture.boomerang.design).toEqual({
      id: border.id, name: 'Test Square with Border', version: Math.floor(border.updatedAt.getTime() / 1000), format: 'square', backgroundColor: '#FFFFFF',
      thumbnail: thumb, slot: slot(54, 54, 972, 972),
    });
    valid(b);

    await new Promise(r => setTimeout(r, 1100));
    await prisma.boothDesignTemplate.update({ where: { id: border.id }, data: { layout: layout('square', 'portrait', 1080, 1080, [slot(54, 54, 972, 972)], { backgroundColor: '#000000' }) } });
    const b2 = await bundle();
    expect(b2.capture.boomerang.design.version).toBeGreaterThan(b.capture.boomerang.design.version);
    expect(b2.capture.boomerang.design.backgroundColor).toBe('#000000');
    expect(b2.bundleVersion).toBe(b.bundleVersion + 1);

    expect((await patch({ format: 'square', design: { source: 'print', id: full.id } })).status).toBe(200);
    expect((await bundle()).capture.boomerang.design.slot).toMatchObject({ x: 0, y: 0, width: 1080, height: 1080 });
  });

  it('sends My 9:16 template with its art, and its 16:9 alternate at the landscape shape', async () => {
    const { tenant, bundle, patch, template } = await setup();
    const background = stored(tenant.id, jpeg(1080, 1920), 'jpg');
    const overlay = stored(tenant.id, png(1920, 1080), 'png');
    const t = await template({
      name: 'Stories', format: '9x16', orientation: 'portrait',
      layout: layout('9x16', 'portrait', 1080, 1920, [slot(60, 200, 960, 1280, { fit: 'fit', rotationDegrees: -4 })], { background }),
      alternateLayout: layout('9x16', 'landscape', 1920, 1080, [slot(100, 60, 1200, 900)], { overlay }),
    });
    expect((await patch({ format: 'portrait9x16', design: { source: 'print', id: t.id } })).status).toBe(200);
    let b = await bundle();
    expect(b.capture.boomerang.design).toMatchObject({ id: t.id, format: 'portrait9x16', background, slot: { x: 60, y: 200, width: 960, height: 1280, fit: 'fit', rotationDegrees: -4 } });
    expect(b.capture.boomerang.design).not.toHaveProperty('overlay');
    valid(b);

    expect((await patch({ format: 'landscape16x9', design: { source: 'print', id: t.id } })).status).toBe(200);
    b = await bundle();
    expect(b.capture.boomerang.design).toMatchObject({ format: 'landscape16x9', overlay, slot: { x: 100, y: 60, width: 1200, height: 900 } });
    valid(b);
  });

  it('sends a single-photo 4x6 template with its slot scaled to the clip', async () => {
    const { tenant, bundle, patch, template } = await setup();
    const overlay = stored(tenant.id, png(1200, 1800), 'png');
    const t = await template({ name: 'Single photo', format: '4x6', orientation: 'portrait', layout: layout('4x6', 'portrait', 1200, 1800, [slot(100, 200, 1000, 1200)], { backgroundColor: '#ffeedd', overlay }) });

    // Only at its own shape
    expect((await patch({ format: 'landscape6x4', design: { source: 'print', id: t.id } })).status).toBe(400);
    expect((await patch({ format: 'portrait4x6', design: { source: 'print', id: t.id } })).status).toBe(200);
    const b = await bundle();
    expect(b.capture.boomerang.design).toMatchObject({ id: t.id, format: 'portrait4x6', backgroundColor: '#FFEEDD', overlay, slot: slot(90, 180, 900, 1080) });
    valid(b);
  });

  it('keeps a Standard template the event chose after it is unpublished; drafts and multi-photo layouts cannot be chosen', async () => {
    const { bundle, patch, template } = await setup();
    const t = await prisma.boothDesignTemplate.create({ data: { tenantId: null, name: 'Test Wide', format: '9x16', orientation: 'landscape', photoCount: 1, isPublished: true, layout: layout('9x16', 'landscape', 1920, 1080, [slot(0, 0, 1920, 1080)]) } });
    const draft = await prisma.boothDesignTemplate.create({ data: { tenantId: null, name: 'Test Draft', format: 'square', orientation: 'portrait', photoCount: 1, isPublished: false, layout: layout('square', 'portrait', 1080, 1080, [slot(0, 0, 1080, 1080)]) } });
    const trio = await template({ name: 'Trio', format: '4x6', orientation: 'landscape', photoCount: 3, layout: layout('4x6', 'landscape', 1800, 1200, [slot(60, 60, 520, 693), { ...slot(640, 60, 520, 693), id: 's2', shotIndex: 1 }]) });
    expect((await patch({ format: 'square', design: { source: 'print', id: draft.id } })).status).toBe(400);
    expect((await patch({ format: 'landscape6x4', design: { source: 'print', id: trio.id } })).status).toBe(400);

    expect((await patch({ format: 'landscape16x9', design: { source: 'print', id: t.id } })).status).toBe(200);
    await prisma.boothDesignTemplate.update({ where: { id: t.id }, data: { isPublished: false } });
    const b = await bundle();
    expect(b.capture.boomerang.design.id).toBe(t.id);
    valid(b);
  });

  it('drops the design when the template loses that shape or is deleted, and tells the editor', async () => {
    const { event, bundle, patch, template } = await setup();
    const t = await template({ name: 'Square frame', format: 'square', orientation: 'portrait', layout: layout('square', 'portrait', 1080, 1080, [slot(54, 54, 972, 972)]) });
    expect((await patch({ design: { source: 'print', id: t.id } })).status).toBe(200);
    expect((await bundle()).capture.boomerang.design.id).toBe(t.id);

    // The event's shape can't change under a chosen template
    const wrong = await patch({ format: 'portrait9x16' });
    expect(wrong.status).toBe(400);
    expect((await wrong.json()).path).toBe('boomerang.design');

    // The template is changed to another size: dropped from the bundle, notice in the editor
    await prisma.boothDesignTemplate.update({ where: { id: t.id }, data: { format: '9x16', layout: layout('9x16', 'portrait', 1080, 1920, [slot(0, 0, 1080, 1920)]) } });
    let b = await bundle();
    expect(b.capture.boomerang).not.toHaveProperty('design');
    expect(b.capture.boomerang.format).toBe('square');
    valid(b);
    expect((await (await DASH(req('/x'), p(event.id))).json()).settings.boomerang.designProblem).toBe('shape');

    // Deleted: dropped too
    await prisma.boothDesignTemplate.update({ where: { id: t.id }, data: { isActive: false } });
    b = await bundle();
    expect(b.capture.boomerang).not.toHaveProperty('design');
    expect((await (await DASH(req('/x'), p(event.id))).json()).settings.boomerang.designProblem).toBe('deleted');

    expect((await patch({ design: null })).status).toBe(200);
    expect((await (await DASH(req('/x'), p(event.id))).json()).settings.boomerang).toMatchObject({ design: null, designProblem: null });
  });

  it('keeps a Boomerang design chosen before templates', async () => {
    const { tenant, bundle } = await setup();
    const d = await prisma.genieClipDesign.create({ data: { tenantId: tenant.id, name: 'Old frame', format: 'portrait3x4', slot: slot(60, 80, 960, 1140) } });
    const s = await prisma.eventGenieSettings.findFirstOrThrow({ where: { tenantId: tenant.id } });
    await prisma.eventGenieSettings.update({ where: { id: s.id }, data: { boomerang: { ...BOOMERANG, format: 'portrait3x4', design: { source: 'clip', id: d.id } } } });
    const b = await bundle();
    expect(b.capture.boomerang.design).toMatchObject({ id: d.id, format: 'portrait3x4', version: 1 });
    valid(b);
  });
});

describe('Boomerang & GIF only sizes', () => {
  it('are made in the template designer with one photo, and never used for photos or offered to clients', async () => {
    const { tenant, event, template } = await setup();
    const base = { name: 'Square', layout: layout('square', 'portrait', 1080, 1080, [slot(54, 54, 972, 972)]) };
    const r = await CREATE_TEMPLATE(req('/x', { body: { ...base, offerToClients: true } }));
    expect(r.status).toBe(201);
    const made = await r.json();
    expect(await prisma.boothDesignTemplate.findUniqueOrThrow({ where: { id: made.id } })).toMatchObject({ format: 'square', orientation: 'portrait' });

    // One photo only
    const two = await CREATE_TEMPLATE(req('/x', { body: { ...base, layout: layout('square', 'portrait', 1080, 1080, [slot(0, 0, 500, 500), { ...slot(540, 0, 500, 500), id: 's2', shotIndex: 1 }]) } }));
    expect(two.status).toBe(400);
    expect((await two.json()).error).toMatch(/one photo/);

    // Not added as a photo template, not in the client's design brief
    expect((await ADD_TO_EVENT(req('/x', { body: { libraryTemplateId: made.id } }), p(event.id))).status).toBe(404);
    expect((await clientTemplates(tenant.id)).map(t => t.id)).not.toContain(made.id);
    // A single-photo 4x6 template still works for photos
    const single = await template({ name: 'Single', format: '4x6', orientation: 'portrait', offerToClients: true, layout: layout('4x6', 'portrait', 1200, 1800, [slot(60, 60, 1080, 1440)]) });
    expect((await ADD_TO_EVENT(req('/x', { body: { libraryTemplateId: single.id } }), p(event.id))).status).toBe(201);
    expect((await clientTemplates(tenant.id)).map(t => t.id)).toContain(single.id);
  });
});
