import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'crypto';
import { deflateSync } from 'zlib';

let session = { tenantId: '', globalRole: 'USER' };
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: session.tenantId, tenantRole: 'HOST_ADMIN', globalRole: session.globalRole })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
const store = new Map<string, Buffer>();
vi.mock('@/lib/storage/r2', () => ({
  r2PublicUrl: (k: string) => 'https://media.boothgen.test/' + k,
  r2KeyForPublicUrl: (u: string) => (u.startsWith('https://media.boothgen.test/') ? u.slice('https://media.boothgen.test/'.length) : null),
  getPresignedUploadUrl: vi.fn(async (k: string) => 'https://r2.test/put/' + k),
  getR2Object: vi.fn(async (k: string) => (store.has(k) ? { body: store.get(k)!, contentType: null } : null)),
  headR2Object: vi.fn(), uploadToR2: vi.fn(), deleteFromR2: vi.fn(async (k: string) => { store.delete(k); }),
}));

import { prisma } from '@/lib/prisma/client';
import { deleteFromR2 } from '@/lib/storage/r2';
import { readImageInfo } from '@/lib/genie/image';
import { GET as LIBRARY, POST as CREATE } from '@/app/api/genie-templates/route';
import { GET as GET_T, PUT as UPDATE, DELETE as REMOVE } from '@/app/api/genie-templates/[templateId]/route';
import { POST as PRESIGN } from '@/app/api/genie-templates/assets/route';
import { POST as VERIFY } from '@/app/api/genie-templates/assets/verify/route';
import { GET as FILE } from '@/app/api/genie-templates/assets/file/route';
import { POST as ADD_T } from '@/app/api/events/[id]/genie/templates/route';
import { DELETE as DEL_EVENT_T } from '@/app/api/events/[id]/genie/templates/[templateId]/route';
import { POST as USE_DESIGN } from '@/app/api/events/[id]/genie/templates/[templateId]/design/route';
import { GET as DASH, POST as SETUP } from '@/app/api/events/[id]/genie/route';
import { GET as BUNDLE_PREVIEW } from '@/app/api/events/[id]/genie/bundle/route';
import { bundleValidator, req, resetDb, seedEvent, seedTenant } from './helpers';

// ── tiny image builders ─────────────────────────────────────────────────────
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf: Buffer) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(width: number, height: number, alpha: boolean) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  const row = 1 + width * (alpha ? 4 : 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(row * height))), chunk('IEND', Buffer.alloc(0))]);
}
function jpeg(width: number, height: number) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}
function put(key: string, body: Buffer) {
  store.set(key, body);
  return { url: 'https://media.boothgen.test/' + key, sha256: 'client-claimed', contentType: 'image/png', bytes: 1 };
}
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const STRIP = (extra: Record<string, unknown> = {}) => ({
  format: '2x6', orientation: 'portrait', widthPx: 600, heightPx: 1800, dpi: 300, backgroundColor: '#FFFFFF',
  slots: [0, 1, 2].map(i => ({ id: 's' + i, shotIndex: i, x: 30, y: 30 + i * 435, width: 540, height: 405, rotationDegrees: 0, fit: 'fill' })),
  ...extra,
});
const LANDSCAPE = (extra: Record<string, unknown> = {}) => ({
  format: '4x6', orientation: 'landscape', widthPx: 1800, heightPx: 1200, dpi: 300, backgroundColor: '#F97316',
  slots: [0, 1, 2].map(i => ({ id: 'l' + i, shotIndex: i, x: 60 + i * 580, y: 60, width: 520, height: 1080, rotationDegrees: i === 1 ? -4 : 0, fit: 'fill' })),
  ...extra,
});
const PORTRAIT = () => ({ ...LANDSCAPE(), orientation: 'portrait', widthPx: 1200, heightPx: 1800, slots: LANDSCAPE().slots.map(s => ({ ...s, x: 60, y: 60 + s.shotIndex * 580, width: 1080, height: 520 })) });

const json = (body: unknown, method = 'POST') => req('/x', { method, body });
const tp = (templateId: string) => ({ params: { templateId } });

async function asTenant(opts: { superAdmin?: boolean } = {}) {
  const t = await seedTenant();
  session = { tenantId: t.tenant.id, globalRole: opts.superAdmin ? 'SUPER_ADMIN' : 'USER' };
  return t;
}

beforeEach(async () => {
  store.clear();
  vi.mocked(deleteFromR2).mockClear();
  await resetDb();
  await prisma.boothDesignTemplate.deleteMany({ where: { name: { startsWith: 'Designer ' } } });
});
afterAll(async () => {
  await resetDb();
  await prisma.boothDesignTemplate.deleteMany({ where: { name: { startsWith: 'Designer ' } } });
  await prisma.$disconnect();
});

describe('image header reading', () => {
  it('reads PNG size and transparency, and JPEG size', () => {
    expect(readImageInfo(png(600, 1800, true))).toEqual({ contentType: 'image/png', width: 600, height: 1800, hasAlpha: true });
    expect(readImageInfo(png(1800, 1200, false))).toMatchObject({ width: 1800, height: 1200, hasAlpha: false });
    expect(readImageInfo(jpeg(1800, 1200))).toEqual({ contentType: 'image/jpeg', width: 1800, height: 1200, hasAlpha: false });
    expect(readImageInfo(Buffer.from('%PDF-1.7 not an image'))).toBeNull();
  });
});

describe('Template library: create and validate', () => {
  it('saves a My template with verified artwork, an alternate and a thumbnail', async () => {
    const { tenant } = await asTenant();
    const overlayBuf = png(600, 1800, true);
    const bgBuf = jpeg(1200, 1800);
    const thumbBuf = png(160, 480, false);
    const body = {
      name: 'Designer Strip',
      layout: STRIP({ overlay: put(`genie-templates/${tenant.id}/o.png`, overlayBuf) }),
      alternateLayout: null,
      thumbnail: put(`genie-templates/${tenant.id}/t.png`, thumbBuf),
    };
    const r = await CREATE(json(body));
    expect(r.status).toBe(201);
    const t = await r.json();
    expect(t.layout.overlay).toEqual({ url: `https://media.boothgen.test/genie-templates/${tenant.id}/o.png`, sha256: sha(overlayBuf), contentType: 'image/png', bytes: overlayBuf.length });
    expect(t.thumbnail.sha256).toBe(sha(thumbBuf));
    const row = await prisma.boothDesignTemplate.findUniqueOrThrow({ where: { id: t.id } });
    expect(row).toMatchObject({ tenantId: tenant.id, isPublished: false, format: '2x6', orientation: 'portrait', photoCount: 3 });

    // Landscape 4x6 with a portrait alternate
    const r2 = await CREATE(json({ name: 'Designer 4x6', layout: LANDSCAPE(), alternateLayout: { ...PORTRAIT(), background: put(`genie-templates/${tenant.id}/bg.jpg`, bgBuf) } }));
    expect(r2.status).toBe(201);
    expect((await r2.json()).alternateLayout.background.contentType).toBe('image/jpeg');

    const lib = await (await LIBRARY()).json();
    expect(lib.mine.map((x: any) => x.name).sort()).toEqual(['Designer 4x6', 'Designer Strip']);
  });

  it.each([
    ['an unsupported size', { layout: { ...STRIP(), widthPx: 700 } }, 400],
    ['a frame past the edge', { layout: STRIP({ slots: [{ id: 'a', shotIndex: 0, x: 100, y: 0, width: 540, height: 400, rotationDegrees: 0, fit: 'fill' }] }) }, 400],
    ['duplicate frame ids', { layout: STRIP({ slots: [0, 1].map(i => ({ id: 'a', shotIndex: i, x: 0, y: i * 500, width: 100, height: 100, rotationDegrees: 0, fit: 'fill' })) }) }, 400],
    ['photo number 11', { layout: STRIP({ slots: [{ id: 'a', shotIndex: 10, x: 0, y: 0, width: 100, height: 100, rotationDegrees: 0, fit: 'fill' }] }) }, 400],
    ['no frames', { layout: STRIP({ slots: [] }) }, 400],
    ['an alternate with the same orientation', { layout: LANDSCAPE(), alternateLayout: LANDSCAPE() }, 400],
    ['a bad colour', { layout: STRIP({ backgroundColor: 'red' }) }, 400],
    ['an empty name', { name: '  ' }, 400],
  ])('rejects %s', async (_n, patch, status) => {
    await asTenant();
    const r = await CREATE(json({ name: 'Designer X', layout: STRIP(), ...patch }));
    expect(r.status).toBe(status);
    expect(await prisma.boothDesignTemplate.count({ where: { name: 'Designer X' } })).toBe(0);
  });

  it('rejects artwork that is the wrong type, shape or owner', async () => {
    const { tenant } = await asTenant();
    const other = await seedTenant();
    const cases: [Record<string, unknown>, string][] = [
      [{ overlay: put(`genie-templates/${tenant.id}/j.jpg`, jpeg(600, 1800)) }, 'must be a PNG'],
      [{ overlay: put(`genie-templates/${tenant.id}/opaque.png`, png(600, 1800, false)) }, 'no transparent areas'],
      [{ background: put(`genie-templates/${tenant.id}/wide.png`, png(1800, 1200, false)) }, 'same shape'],
      [{ background: put(`genie-templates/${other.tenant.id}/theirs.png`, png(600, 1800, false)) }, "isn't in your account"],
      [{ background: { url: 'https://evil.test/x.png', sha256: 'x', contentType: 'image/png', bytes: 1 } }, "isn't in your account"],
      [{ background: put(`genie-templates/${tenant.id}/doc.pdf`, Buffer.from('%PDF-1.7')) }, 'PNG or JPG'],
      [{ background: { url: `https://media.boothgen.test/genie-templates/${tenant.id}/missing.png`, sha256: 'x', contentType: 'image/png', bytes: 1 } }, 'finished uploading'],
    ];
    for (const [extra, msg] of cases) {
      const r = await CREATE(json({ name: 'Designer Bad', layout: STRIP(extra) }));
      expect(r.status, msg).toBe(422);
      expect((await r.json()).error).toContain(msg);
    }
  });
});

describe('Template library: Standard vs My templates', () => {
  it('only super admins create and edit Standard templates; tenants see them once published', async () => {
    await asTenant();
    expect((await CREATE(json({ name: 'Designer Std', scope: 'standard', layout: STRIP() }))).status).toBe(403);

    await asTenant({ superAdmin: true });
    const created = await (await CREATE(json({ name: 'Designer Std', scope: 'standard', layout: STRIP(), isPublished: false }))).json();
    expect((await prisma.boothDesignTemplate.findUniqueOrThrow({ where: { id: created.id } })).tenantId).toBeNull();

    const viewer = await asTenant();
    expect((await GET_T(req('/x'), tp(created.id))).status).toBe(404); // unpublished
    session = { tenantId: viewer.tenant.id, globalRole: 'SUPER_ADMIN' };
    expect((await UPDATE(json({ name: 'Designer Std', layout: STRIP(), isPublished: true }, 'PUT'), tp(created.id))).status).toBe(200);
    session = { tenantId: viewer.tenant.id, globalRole: 'USER' };
    const lib = await (await LIBRARY()).json();
    expect(lib.standard.map((t: any) => t.id)).toContain(created.id);
    expect((await (await GET_T(req('/x'), tp(created.id))).json()).canEdit).toBe(false);
    expect((await UPDATE(json({ name: 'Designer Hijack', layout: STRIP() }, 'PUT'), tp(created.id))).status).toBe(403);
    expect((await REMOVE(req('/x', { method: 'DELETE' }), tp(created.id))).status).toBe(403);
  });

  it("never reads, edits or deletes another tenant's template", async () => {
    await asTenant();
    const mine = await (await CREATE(json({ name: 'Designer Mine', layout: STRIP() }))).json();
    await asTenant();
    expect((await GET_T(req('/x'), tp(mine.id))).status).toBe(404);
    expect((await UPDATE(json({ name: 'Designer Hijack', layout: STRIP() }, 'PUT'), tp(mine.id))).status).toBe(404);
    expect((await REMOVE(req('/x', { method: 'DELETE' }), tp(mine.id))).status).toBe(404);
    expect((await CREATE(json({ name: 'Designer Copy', layout: STRIP(), copyFrom: mine.id }))).status).toBe(404);
    expect((await prisma.boothDesignTemplate.findUniqueOrThrow({ where: { id: mine.id } })).name).toBe('Designer Mine');
  });

  it('deleting hides the template from the library but events keep their copy', async () => {
    const { tenant, client } = await asTenant();
    const t = await (await CREATE(json({ name: 'Designer Gone', layout: STRIP() }))).json();
    const event = await seedEvent(tenant.id, client.id);
    expect((await ADD_T(json({ libraryTemplateId: t.id }), { params: { id: event.id } })).status).toBe(201);
    expect((await REMOVE(req('/x', { method: 'DELETE' }), tp(t.id))).status).toBe(200);
    expect((await (await LIBRARY()).json()).mine).toHaveLength(0);
    expect(await prisma.eventGenieTemplate.count({ where: { eventId: event.id, libraryTemplateId: t.id } })).toBe(1);
  });

  it('duplicating a Standard template reuses its artwork', async () => {
    await asTenant({ superAdmin: true });
    const art = png(600, 1800, true);
    const std = await (await CREATE(json({ name: 'Designer Std Art', scope: 'standard', isPublished: true, layout: STRIP({ overlay: put('genie-templates/standard/o.png', art) }) }))).json();
    await asTenant();
    const dup = await CREATE(json({ name: 'Designer Std Art (copy)', layout: std.layout, copyFrom: std.id }));
    expect(dup.status).toBe(201);
    expect((await dup.json()).layout.overlay.sha256).toBe(sha(art));
  });
});

describe('Template artwork uploads', () => {
  it('signs uploads into the tenant folder, Standard only for super admins', async () => {
    const { tenant } = await asTenant();
    const r = await PRESIGN(json({ scope: 'mine', contentType: 'image/png', bytes: 1000 }));
    expect((await r.json()).url).toMatch(new RegExp(`^https://media.boothgen.test/genie-templates/${tenant.id}/[0-9a-f-]+\\.png$`));
    expect((await PRESIGN(json({ scope: 'standard', contentType: 'image/png', bytes: 1000 }))).status).toBe(403);
    expect((await PRESIGN(json({ scope: 'mine', contentType: 'image/gif', bytes: 1000 }))).status).toBe(400);
    expect((await PRESIGN(json({ scope: 'mine', contentType: 'image/png', bytes: 16 * 1024 * 1024 }))).status).toBe(400);
  });

  it('verifies the uploaded file and serves only the tenant\'s own artwork', async () => {
    const { tenant } = await asTenant();
    const other = await seedTenant();
    const mine = put(`genie-templates/${tenant.id}/a.png`, png(1800, 1200, true));
    const v = await (await VERIFY(json({ url: mine.url, scope: 'mine', canvas: { widthPx: 1800, heightPx: 1200 } }))).json();
    expect(v).toMatchObject({ width: 1800, height: 1200, hasAlpha: true });
    const small = put(`genie-templates/${tenant.id}/small.png`, png(900, 600, false));
    expect((await (await VERIFY(json({ url: small.url, scope: 'mine', canvas: { widthPx: 1800, heightPx: 1200 } }))).json()).warning).toContain('print soft');
    expect((await VERIFY(json({ url: mine.url, scope: 'mine', canvas: { widthPx: 600, heightPx: 1800 } }))).status).toBe(422);

    expect((await FILE(req('/x?url=' + encodeURIComponent(mine.url)))).status).toBe(200);
    const theirs = put(`genie-templates/${other.tenant.id}/b.png`, png(10, 10, false));
    expect((await FILE(req('/x?url=' + encodeURIComponent(theirs.url)))).status).toBe(404);
    expect((await FILE(req('/x?url=' + encodeURIComponent(`https://media.boothgen.test/genie-templates/${tenant.id}/../${other.tenant.id}/b.png`)))).status).toBe(404);
  });
});

describe('Event templates: approved design, client pick, thumbnail', () => {
  async function approve(tenantId: string, eventId: string, key: string, body: Buffer, version = 1) {
    store.set(key, body);
    return prisma.templateDesign.create({ data: { tenantId, eventId, fileUrl: 'https://media.boothgen.test/' + key, filename: key.split('/').pop()!, status: 'APPROVED', version, approvedAt: new Date() } });
  }

  it('places the approved design over or behind the photos, and the bundle still validates', async () => {
    const { tenant, client } = await asTenant();
    const event = await seedEvent(tenant.id, client.id);
    const t = await prisma.eventGenieTemplate.findFirstOrThrow({ where: { eventId: event.id } });
    const p = { params: { id: event.id, templateId: t.id } };
    expect((await USE_DESIGN(json({}), p)).status).toBe(409);

    const design = await approve(tenant.id, event.id, `templates/${tenant.id}/${event.id}/strip.png`, png(600, 1800, true));
    const r = await USE_DESIGN(json({}), p);
    expect(r.status).toBe(200);
    const d = await r.json();
    expect(d.appliedAs).toBe('overlay');
    expect(d.designId).toBe(design.id);
    expect(d.layout.overlay.url).toBe(design.fileUrl);
    expect(d.layout.background).toBeUndefined();
    expect(d.version).toBe(2);
    const validate = await bundleValidator();
    if (validate) expect(validate(await (await BUNDLE_PREVIEW(req('/x'), { params: { id: event.id } })).json())).toBeNull();

    const dash = await (await DASH(req('/x'), { params: { id: event.id } })).json();
    expect(dash.approvedDesign).toMatchObject({ id: design.id, version: 1 });

    await approve(tenant.id, event.id, `templates/${tenant.id}/${event.id}/v2.jpg`, jpeg(600, 1800), 2);
    expect((await (await USE_DESIGN(json({}), p)).json()).appliedAs).toBe('background');
  });

  it('refuses designs that are not PNG/JPG, the wrong shape, or another tenant\'s', async () => {
    const { tenant, client } = await asTenant();
    const event = await seedEvent(tenant.id, client.id);
    const t = await prisma.eventGenieTemplate.findFirstOrThrow({ where: { eventId: event.id } });
    const p = { params: { id: event.id, templateId: t.id } };
    await approve(tenant.id, event.id, `templates/${tenant.id}/${event.id}/proof.pdf`, Buffer.from('%PDF-1.7'));
    expect((await USE_DESIGN(json({}), p)).status).toBe(422);
    await approve(tenant.id, event.id, `templates/${tenant.id}/${event.id}/wide.png`, png(1800, 1200, true), 2);
    expect((await (await USE_DESIGN(json({}), p)).json()).error).toContain("doesn't match");
    await approve(tenant.id, event.id, `templates/${tenant.id}/${event.id}/opaque.png`, png(600, 1800, false), 3);
    expect((await (await USE_DESIGN(json({ mode: 'overlay' }), p)).json()).error).toContain('no transparent areas');

    await asTenant();
    expect((await USE_DESIGN(json({}), p)).status).toBe(404);
  });

  it("starts the event with the client's chosen layout and copies the template thumbnail", async () => {
    const { tenant, client } = await asTenant();
    const thumb = png(160, 480, false);
    const lib = await (await CREATE(json({ name: 'Designer Pick', layout: STRIP(), thumbnail: put(`genie-templates/${tenant.id}/thumb.png`, thumb) }))).json();
    const event = await seedEvent(tenant.id, client.id, { settings: false, templates: 0 });
    await prisma.eventDesignBrief.create({ data: { tenantId: tenant.id, eventId: event.id, templateId: lib.id } });

    expect((await SETUP(json({ timeZone: 'America/Denver' }), { params: { id: event.id } })).status).toBe(201);
    const dash = await (await DASH(req('/x'), { params: { id: event.id } })).json();
    expect(dash.briefTemplate).toEqual({ id: lib.id, name: 'Designer Pick' });
    expect(dash.templates.map((t: any) => t.libraryTemplateId)).toEqual([lib.id]);

    const bundle = await (await BUNDLE_PREVIEW(req('/x'), { params: { id: event.id } })).json();
    expect(bundle.templates[0].thumbnail).toEqual({ url: `https://media.boothgen.test/genie-templates/${tenant.id}/thumb.png`, sha256: sha(thumb), contentType: 'image/png', bytes: thumb.length });
    const validate = await bundleValidator();
    if (validate) expect(validate(bundle)).toBeNull();
  });
});

describe('Template image cleanup', () => {
  it('deletes a replaced image only when nothing else uses it', async () => {
    const { tenant, client } = await asTenant();
    const v1 = put(`genie-templates/${tenant.id}/v1.png`, png(600, 1800, true));
    const t = await (await CREATE(json({ name: 'Designer Clean', layout: STRIP({ overlay: v1 }) }))).json();

    // An event uses the template: its copy shares v1
    const event = await seedEvent(tenant.id, client.id);
    await ADD_T(json({ libraryTemplateId: t.id }), { params: { id: event.id } });
    const v2 = put(`genie-templates/${tenant.id}/v2.png`, png(600, 1800, true));
    expect((await UPDATE(json({ name: 'Designer Clean', layout: STRIP({ overlay: v2 }) }, 'PUT'), tp(t.id))).status).toBe(200);
    expect(vi.mocked(deleteFromR2)).not.toHaveBeenCalled(); // the event copy still uses v1

    // Replace v2, which nothing else uses
    const v3 = put(`genie-templates/${tenant.id}/v3.png`, png(600, 1800, true));
    await UPDATE(json({ name: 'Designer Clean', layout: STRIP({ overlay: v3 }) }, 'PUT'), tp(t.id));
    expect(vi.mocked(deleteFromR2).mock.calls.map(c => c[0])).toEqual([`genie-templates/${tenant.id}/v2.png`]);
  });

  it('never deletes client design files', async () => {
    const { tenant, client } = await asTenant();
    const event = await seedEvent(tenant.id, client.id);
    const t = await prisma.eventGenieTemplate.findFirstOrThrow({ where: { eventId: event.id } });
    store.set(`templates/${tenant.id}/${event.id}/d.png`, png(600, 1800, true));
    await prisma.templateDesign.create({ data: { tenantId: tenant.id, eventId: event.id, fileUrl: `https://media.boothgen.test/templates/${tenant.id}/${event.id}/d.png`, filename: 'd.png', status: 'APPROVED', version: 1, approvedAt: new Date() } });
    await USE_DESIGN(json({}), { params: { id: event.id, templateId: t.id } });
    await DEL_EVENT_T(req('/x', { method: 'DELETE' }), { params: { id: event.id, templateId: t.id } });
    expect(vi.mocked(deleteFromR2)).not.toHaveBeenCalled();
  });
});
