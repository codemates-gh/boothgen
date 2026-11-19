import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';

let session: Record<string, unknown> = {};
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', ...session })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async () => ({})) }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));

// Fake R2: what the text renderer stores (with its sha256 metadata)
const BASE = 'https://media.boothgen.test/';
const files = new Map<string, { body: Buffer; metadata?: Record<string, string> }>();
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  getR2Object: vi.fn(async (key: string) => (files.has(key) ? { body: files.get(key)!.body, contentType: null } : null)),
  headR2Object: vi.fn(async (key: string) => (files.has(key) ? { bytes: files.get(key)!.body.length, metadata: files.get(key)!.metadata } : null)),
  uploadToR2: vi.fn(async (key: string, body: Buffer, _t: string, metadata?: Record<string, string>) => { files.set(key, { body, metadata }); return BASE + key; }),
  deleteFromR2: vi.fn(async (key: string) => { files.delete(key); }),
  r2PublicUrl: (key: string) => BASE + key,
  r2KeyForPublicUrl: (url: string) => (url.startsWith(BASE) ? url.slice(BASE.length) : null),
}));

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { prisma } from '@/lib/prisma/client';
import { GET as deviceBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { POST as ADD_TO_EVENT } from '@/app/api/events/[id]/genie/templates/route';
import { GET as TEXT, PUT as SET_TEXT } from '@/app/api/events/[id]/genie/template-text/route';
import { POST as CREATE_TEMPLATE } from '@/app/api/genie-templates/route';
import { fitText, newTextBox, type TextBox } from '@/lib/templates/textLayer';
import { renderTextOverlay } from '@/lib/genie/textRender';
import { eventAnswers, eventLook, EventTextOptions } from '@/lib/genie/eventText';
import { bundleValidator, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const ev = (eventId: string) => ({ params: Promise.resolve({ eventId }) });
const p = (id: string) => ({ params: Promise.resolve({ id }) });

const ZONES = [
  { id: 'z-names', label: 'Names', placeholder: 'Geoffrey & Ronnette', maxChars: 40, required: true },
  { id: 'z-date', label: 'Date', placeholder: 'July 10, 2027', maxChars: 30, required: false },
];
const PALETTES = [
  { id: 'p-gold', name: 'Gold', colors: { background: '#FFF8E7', text: '#3A2E1F', accent: '#D4AF37' } },
  { id: 'p-navy', name: 'Navy', colors: { background: '#0B1F3A', text: '#FFFFFF', accent: '#C0C0C0' } },
];
const PAIRINGS = [
  { id: 'f-classic', name: 'Classic', fonts: [{ zoneId: 'z-names', fontId: 'playfair', label: 'Names', fontFamily: "'Playfair Display', serif" }, { zoneId: 'z-date', fontId: 'lato', label: 'Date', fontFamily: "'Lato', sans-serif" }] },
  { id: 'f-script', name: 'Script', fonts: [{ zoneId: 'z-names', fontId: 'great-vibes', label: 'Names', fontFamily: "'Great Vibes', cursive" }, { zoneId: 'z-date', fontId: 'montserrat', label: 'Date', fontFamily: "'Montserrat', sans-serif" }] },
];

const box = (zoneId: string, extra: Partial<TextBox> = {}): TextBox => ({ ...newTextBox('t-' + zoneId, zoneId, { widthPx: 1200, heightPx: 1800 }), ...extra });
const slot = { id: 's1', shotIndex: 0, x: 100, y: 100, width: 1000, height: 1300, rotationDegrees: 0, fit: 'fill' };
const LAYOUT = { format: '4x6', orientation: 'portrait', widthPx: 1200, heightPx: 1800, dpi: 300, backgroundColor: '#FFFFFF', slots: [slot] };

// Opaque pixels in a PNG inside a rectangle
async function inked(png: Buffer, x: number, y: number, w: number, h: number) {
  const img = await loadImage(png);
  const c = createCanvas(img.width, img.height); const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(x, y, w, h).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
  return n;
}

let validate: Awaited<ReturnType<typeof bundleValidator>>;
beforeEach(async () => { await resetDb(); files.clear(); validate ??= await bundleValidator(); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('drawing', () => {
  it('shrinks long words to fit the box and wraps onto more lines', async () => {
    const { GlobalFonts } = await import('@napi-rs/canvas');
    GlobalFonts.registerFromPath('public/fonts/template/montserrat.ttf', 'BGT-montserrat');
    const ctx = createCanvas(10, 10).getContext('2d') as any;
    const short = fitText(ctx, 'Ana', 'BGT-montserrat', { width: 600, height: 100, maxFontPx: 80 });
    expect(short.size).toBe(80);
    const long = fitText(ctx, 'Alexandra Konstantinopoulou and Maximilian Featherstonehaugh', 'BGT-montserrat', { width: 600, height: 100, maxFontPx: 80 });
    expect(long.size).toBeLessThan(80);
    expect(long.lines.length * long.size * 1.2).toBeLessThanOrEqual(100.5);
  });

  it('draws only boxes with words, in the box, on top of nothing else', async () => {
    const layout = { ...LAYOUT, texts: [box('z-names', { y: 1500, height: 200 }), box('z-date', { y: 100, height: 100 })] } as any;
    const look = { colors: PALETTES[0].colors, pairing: PAIRINGS[0] };
    const png = await renderTextOverlay(layout, { 'z-names': 'Sam & Alex' }, look);
    expect(png).not.toBeNull();
    expect(await inked(png!, 0, 1500, 1200, 200)).toBeGreaterThan(500); // names drawn
    expect(await inked(png!, 0, 0, 1200, 300)).toBe(0); // no date: left out
    expect(await renderTextOverlay(layout, {}, look)).toBeNull();
  });

  it('an outline and a shadow add ink around the letters', async () => {
    const look = { colors: PALETTES[0].colors, pairing: PAIRINGS[0] };
    const plain = { ...LAYOUT, texts: [box('z-names', { y: 1500, height: 200 })] } as any;
    const styled = { ...LAYOUT, texts: [box('z-names', { y: 1500, height: 200, outline: { enabled: true, color: 'accent', widthPx: 6 }, shadow: { enabled: true, color: '#000000', opacity: 0.6, blurPx: 8, distancePx: 10, angleDegrees: 45 } })] } as any;
    const a = await inked((await renderTextOverlay(plain, { 'z-names': 'Sam & Alex' }, look))!, 0, 1400, 1200, 400);
    const b = await inked((await renderTextOverlay(styled, { 'z-names': 'Sam & Alex' }, look))!, 0, 1400, 1200, 400);
    expect(b).toBeGreaterThan(a * 1.3);
    // The client turned both off
    const off = await inked((await renderTextOverlay(styled, { 'z-names': 'Sam & Alex' }, { ...look, adjust: { 't-z-names': { outline: false, shadow: false } } }))!, 0, 1400, 1200, 400);
    expect(off).toBe(a);
  });
});

describe('which words, palette and fonts', () => {
  const brief = {
    templateId: 'lib-1', textValues: { 'brief-names': 'Sam & Alex' }, selectedColorVariantId: 'bp-2', selectedFontPairingId: 'bf-1',
    template: { textZones: [{ id: 'brief-names', label: 'names ', placeholder: '', maxChars: 40, required: true }], colorVariants: [{ id: 'bp-2', name: 'Navy', colors: PALETTES[1].colors }], fontPairings: [{ id: 'bf-1', name: 'Script', fonts: [] }] },
  };
  it('matches the brief by field label; what the operator typed wins', () => {
    expect(eventAnswers(brief, {})).toEqual({ names: 'Sam & Alex' });
    expect(eventAnswers(brief, { Names: 'Sam and Alex', Date: 'June 1' })).toEqual({ names: 'Sam and Alex', date: 'June 1' });
  });
  it("uses the client's palette and fonts by name on another template, else the first; the operator's choice wins", () => {
    const opts = EventTextOptions.parse({ textZones: ZONES, colorVariants: PALETTES, fontPairings: PAIRINGS });
    expect(eventLook(opts, 'other', brief)).toMatchObject({ paletteId: 'p-navy', pairingId: 'f-script' });
    expect(eventLook(opts, 'other', null)).toMatchObject({ paletteId: 'p-gold', pairingId: 'f-classic' });
    expect(eventLook({ ...opts, paletteId: 'p-gold' }, 'other', brief)).toMatchObject({ paletteId: 'p-gold' });
  });
  it("applies the client's outline/shadow/size choices on their brief template; the operator's changes win", () => {
    const opts = EventTextOptions.parse({ textZones: ZONES, colorVariants: PALETTES, fontPairings: PAIRINGS });
    const withAdjust = { ...brief, textAdjust: { 't-z-names': { outline: false, scale: 1.25 } } };
    expect(eventLook(opts, 'lib-1', withAdjust).adjust).toEqual({ 't-z-names': { outline: false, scale: 1.25 } });
    expect(eventLook(opts, 'other', withAdjust).adjust).toEqual({}); // another template: other boxes
    expect(eventLook({ ...opts, adjust: { 't-z-names': { scale: 0.8 } } }, 'lib-1', withAdjust).adjust).toEqual({ 't-z-names': { scale: 0.8 } });
  });
});

describe('templates and events', () => {
  async function setup() {
    const { tenant, client } = await seedTenant();
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN' };
    const event = await seedEvent(tenant.id, client.id, { templates: 0 });
    const { token } = await seedDevice(tenant.id);
    const bundle = async () => (await deviceBundle(req('/x', { token }), ev(event.id))).json();
    return { tenant, event, bundle };
  }
  const create = (layout: unknown, extra: Record<string, unknown> = {}) => CREATE_TEMPLATE(req('/x', { method: 'POST', body: {
    name: 'Wedding', scope: 'mine', layout, textZones: ZONES, colorVariants: PALETTES, fontPairings: PAIRINGS, ...extra,
  } }));

  it('saves text boxes with the template and refuses a box for a removed field', async () => {
    const { tenant } = await setup();
    const ok = await create({ ...LAYOUT, texts: [box('z-names')] });
    expect(ok.status).toBe(201);
    const saved = await prisma.boothDesignTemplate.findFirstOrThrow({ where: { name: 'Wedding', tenantId: tenant.id } });
    expect((saved.layout as any).texts).toHaveLength(1);
    const bad = await create({ ...LAYOUT, texts: [box('z-gone')] });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/removed/);
  });

  it("draws the event's words into the overlay; iPads never get the boxes, and missing words are left out", async () => {
    const { tenant, event, bundle } = await setup();
    await create({ ...LAYOUT, texts: [box('z-names', { y: 1500, height: 200 }), box('z-date', { y: 1420, height: 80 })] });
    const lib = await prisma.boothDesignTemplate.findFirstOrThrow({ where: { name: 'Wedding', tenantId: tenant.id } });
    const added = await ADD_TO_EVENT(req('/x', { method: 'POST', body: { libraryTemplateId: lib.id } }), p(event.id));
    expect([added.status, await added.json()]).toMatchObject([201, {}]);

    // Nothing filled in yet: no overlay, no words, warning on the event
    let b = await bundle();
    expect(validate!(b)).toBeNull();
    expect(b.templates[0].layout.texts).toBeUndefined();
    expect(b.templates[0].layout.overlay).toBeUndefined();
    expect(b.templates[0].layout.backgroundColor).toBe('#FFF8E7'); // the first palette's background
    const view = await (await TEXT(req('/x'), p(event.id))).json();
    expect(view.fields.map((f: any) => [f.label, f.value])).toEqual([['Names', ''], ['Date', '']]);

    // The operator types the names and picks the Navy palette
    const put = await SET_TEXT(req('/x', { method: 'PUT', body: { answers: { names: 'Sam & Alex' }, templates: [{ id: view.templates[0].id, paletteId: 'p-navy' }] } }), p(event.id));
    expect(put.status).toBe(200);
    b = await bundle();
    expect(validate!(b)).toBeNull();
    const overlay = b.templates[0].layout.overlay;
    expect(overlay.url).toMatch(/\/text\/[0-9a-f]{64}\.png$/);
    const stored = files.get(overlay.url.slice(BASE.length))!;
    expect(createHash('sha256').update(stored.body).digest('hex')).toBe(overlay.sha256);
    expect(overlay.bytes).toBe(stored.body.length);
    expect(b.templates[0].layout.backgroundColor).toBe('#0B1F3A');
    expect(await inked(stored.body, 0, 1500, 1200, 200)).toBeGreaterThan(500);
    expect(await inked(stored.body, 0, 1420, 1200, 80)).toBe(0); // no date yet

    // Same words again: the same file, not drawn twice
    const version = b.bundleVersion;
    b = await bundle();
    expect(b.templates[0].layout.overlay.url).toBe(overlay.url);
    expect(b.bundleVersion).toBe(version);
  });

  it("uses the client's brief words when the operator hasn't typed any", async () => {
    const { tenant, event, bundle } = await setup();
    await create({ ...LAYOUT, texts: [box('z-names', { y: 1500, height: 200 })] });
    const lib = await prisma.boothDesignTemplate.findFirstOrThrow({ where: { name: 'Wedding', tenantId: tenant.id } });
    await ADD_TO_EVENT(req('/x', { method: 'POST', body: { libraryTemplateId: lib.id } }), p(event.id));
    await prisma.eventDesignBrief.create({ data: { tenantId: tenant.id, eventId: event.id, templateId: lib.id, textValues: { 'z-names': 'Jo & Kim' }, selectedColorVariantId: 'p-navy', status: 'SUBMITTED' } });
    const view = await (await TEXT(req('/x'), p(event.id))).json();
    expect(view.fields[0]).toMatchObject({ value: 'Jo & Kim', briefValue: 'Jo & Kim', typed: false });
    expect(view.templates[0].paletteId).toBe('p-navy');
    const b = await bundle();
    expect(b.templates[0].layout.overlay).toBeDefined();
    expect(b.templates[0].layout.backgroundColor).toBe('#0B1F3A');
  });
});
