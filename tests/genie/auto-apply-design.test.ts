import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { deflateSync } from 'zlib';

let tenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));
vi.mock('@/lib/email/send', () => ({ sendDesignDecisionEmail: vi.fn(async () => ({ success: true, id: 'x' })) }));
const store = new Map<string, Buffer>();
vi.mock('@/lib/storage/r2', () => ({
  r2PublicUrl: (k: string) => 'https://media.boothgen.test/' + k,
  r2KeyForPublicUrl: (u: string) => (u.startsWith('https://media.boothgen.test/') ? u.slice('https://media.boothgen.test/'.length) : null),
  getPresignedUploadUrl: vi.fn(), headR2Object: vi.fn(), uploadToR2: vi.fn(), deleteFromR2: vi.fn(),
  getR2Object: vi.fn(async (k: string) => (store.has(k) ? { body: store.get(k)!, contentType: null } : null)),
}));

import { prisma } from '@/lib/prisma/client';
import { POST as APPROVE } from '@/app/api/template-designs/[id]/approve/route';
import { POST as SETUP } from '@/app/api/events/[id]/genie/route';
import { STANDARD_TEMPLATES } from '../../scripts/standard-templates.mjs';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const STRIP = STANDARD_TEMPLATES.find((t: { id: string }) => t.id === 'std_s_three')!.layout;

// Minimal PNG of the given size, with or without an alpha channel
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

const PREFIX = 'AA test ';
beforeEach(async () => { await resetDb(); await prisma.boothDesignTemplate.deleteMany({ where: { name: { startsWith: PREFIX } } }); store.clear(); });
afterAll(async () => { await resetDb(); await prisma.boothDesignTemplate.deleteMany({ where: { name: { startsWith: PREFIX } } }); await prisma.$disconnect(); });

async function setup(opts: { genieSetUp?: boolean; started?: boolean; size?: [number, number] } = {}) {
  const { tenant, client } = await seedTenant();
  tenantId = tenant.id;
  const event = await seedEvent(tenant.id, client.id, { settings: opts.genieSetUp ?? true, templates: opts.genieSetUp === false ? 0 : 1 });
  if (opts.started) await prisma.event.update({ where: { id: event.id }, data: { startTime: new Date(Date.now() - 3600_000), eventDate: new Date(Date.now() - 3600_000) } });
  const lib = await prisma.boothDesignTemplate.create({ data: { tenantId: null, name: PREFIX + randomUUID().slice(0, 6), format: '2x6', orientation: 'portrait', isPublished: true, layout: STRIP } });
  await prisma.eventDesignBrief.create({ data: { tenantId: tenant.id, eventId: event.id, templateId: lib.id, status: 'SUBMITTED' } });
  const key = `templates/${tenant.id}/${randomUUID()}.png`;
  const [w, h] = opts.size ?? [600, 1800];
  store.set(key, png(w, h, true));
  const design = await prisma.templateDesign.create({ data: { tenantId: tenant.id, eventId: event.id, fileUrl: 'https://media.boothgen.test/' + key, filename: 'final.png', status: 'PENDING_APPROVAL', version: 2 } });
  const { portalToken } = await prisma.event.findUniqueOrThrow({ where: { id: event.id }, select: { portalToken: true } });
  const approve = () => APPROVE(req('/x', { method: 'POST', body: { portalToken } }), { params: { id: design.id } });
  return { event, lib, design, approve };
}

describe('Approved design goes into Genie', () => {
  it("is added on the client's layout, first in the guest picker, when the client approves", async () => {
    const { event, lib, design, approve } = await setup();
    expect((await approve()).status).toBe(200);
    const templates = await prisma.eventGenieTemplate.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
    expect(templates).toHaveLength(2);
    expect(templates[0]).toMatchObject({ libraryTemplateId: lib.id, designId: design.id });
    expect((templates[0].layout as { overlay?: { url: string } }).overlay?.url).toBe(design.fileUrl);
  });

  it('is placed when Genie is set up later', async () => {
    const { event, lib, design, approve } = await setup({ genieSetUp: false });
    expect((await approve()).status).toBe(200);
    expect(await prisma.eventGenieTemplate.count({ where: { eventId: event.id } })).toBe(0);
    expect((await SETUP(req('/x', { method: 'POST', body: {} }), { params: { id: event.id } })).status).toBe(201);
    expect(await prisma.eventGenieTemplate.findFirst({ where: { eventId: event.id, libraryTemplateId: lib.id } })).toMatchObject({ designId: design.id });
  });

  it("leaves running events and files that don't fit alone, but still approves", async () => {
    const started = await setup({ started: true });
    expect((await started.approve()).status).toBe(200);
    expect(await prisma.eventGenieTemplate.count({ where: { eventId: started.event.id, designId: { not: null } } })).toBe(0);

    const wrongSize = await setup({ size: [1200, 1800] });
    expect((await wrongSize.approve()).status).toBe(200);
    expect((await prisma.templateDesign.findUniqueOrThrow({ where: { id: wrongSize.design.id } })).status).toBe('APPROVED');
    expect(await prisma.eventGenieTemplate.count({ where: { eventId: wrongSize.event.id, libraryTemplateId: wrongSize.lib.id } })).toBe(0);
  });
});
