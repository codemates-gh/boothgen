import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Genie add-ons (2.114.0): Glamour Style, $15 per event (Super Admin can change it), charged with the event

let sessionTenantId = '';
let globalRole = 'USER';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN', globalRole })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));
const created: any[] = [];
vi.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { create: vi.fn(async (args: any) => { created.push(args); return { id: 'cs_test_' + randomUUID(), url: 'https://checkout.stripe.test/pay' }; }) } } },
}));
const objects = new Map<string, number>();
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  getPresignedUploadUrl: vi.fn(async (key: string) => 'https://r2.test/upload/' + key),
  headR2Object: vi.fn(async (key: string) => (objects.has(key) ? { bytes: objects.get(key)! } : null)),
  r2PublicUrl: (key: string) => 'https://media.boothgen.test/' + key,
}));

import { prisma } from '@/lib/prisma/client';
import { buildEventBundle } from '@/lib/genie/bundle';
import { compEvent, eventBilling, recordCheckout, PAYMENT_KIND } from '@/lib/genie/payments';
import { boothEventsClient } from '@/lib/genie/boothEvents';
import { copyGenieSetup } from '@/lib/genie/duplicate';
import { POST as PAY } from '@/app/api/genie-events/[id]/pay/route';
import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { POST as uploadUrl } from '@/app/api/genie/events/[eventId]/upload-url/route';
import { POST as registerAsset } from '@/app/api/genie/events/[eventId]/assets/route';
import { GET as sessionPage } from '@/app/api/g/[token]/s/[sessionToken]/route';
import { GET as galleryPage } from '@/app/api/g/[token]/route';
import { PATCH as TENANT } from '@/app/api/super-admin/tenants/[id]/route';
import { GET as USAGE } from '@/app/api/super-admin/genie-usage/route';
import { guestSession, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const ev = (id: string) => ({ params: Promise.resolve({ id }) });
const GLAMOUR = { filters: { guestFiltersEnabled: true, defaultFilterId: 'original', filterIds: ['original', 'glamourStyle'] } };

async function setup(product: 'genie' | 'crm' = 'genie') {
  const t = await seedTenant({ pro: product === 'crm' });
  await prisma.tenant.update({ where: { id: t.tenant.id }, data: { product } });
  sessionTenantId = t.tenant.id;
  const client = product === 'genie' ? await boothEventsClient(t.tenant.id) : t.client;
  const event = await seedEvent(t.tenant.id, client.id);
  return { tenant: { ...t.tenant, product }, event };
}
const checkout = (tenantId: string, eventId: string, meta: Record<string, string>, amount: number) => ({
  id: 'cs_test_' + randomUUID(), payment_status: 'paid', amount_total: amount, currency: 'usd', metadata: { kind: PAYMENT_KIND, tenantId, eventId, ...meta },
} as any);

beforeEach(async () => {
  await resetDb(); created.length = 0; globalRole = 'USER';
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['genie_event_price_cents', 'genius_pays_per_event', 'addon_price_cents_glamour_style', 'glamour_style_ready'] } } });
  await prisma.systemSetting.create({ data: { key: 'glamour_style_ready', value: 'on' } });
});
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Glamour Style add-on', () => {
  it('Beautify is a free standard filter: no add-on, no charge, saved and sent as Beautify', async () => {
    const { tenant, event } = await setup('genie');
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '2' }, 1500));
    // An event saved under 2.114.0 holds the name "Glamour Style" on the Beautify filter
    await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { filters: [{ id: 'original', name: 'Original', steps: [] }, { id: 'glamour', name: 'Glamour Style', steps: [{ type: 'beautify', intensity: 0.8 }] }] } });
    expect(await eventBilling(tenant, event.id)).toMatchObject({ addOns: [], watermark: false, amountDueCents: 0 });
    const b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && (b.bundle.filters as any).filters.find((f: any) => f.id === 'glamour')).toEqual({ id: 'glamour', name: 'Beautify', steps: [{ type: 'beautify', intensity: 0.8 }] });
    // Both offered, each at its own strength: only Glamour Style is charged
    const r = await PATCH(req('/x', { method: 'PATCH', body: { filters: { ...GLAMOUR.filters, filterIds: ['original', 'glamour', 'glamourStyle'], glamourIntensity: 0.5, glamourStyleIntensity: 0.9 } } }), ev(event.id));
    expect(r.status).toBe(200);
    const stored = (await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).filters as any[];
    expect(stored.map(f => [f.id, f.name, f.steps[0]?.type, f.steps[0]?.intensity])).toEqual([
      ['original', 'Original', undefined, undefined], ['glamour', 'Beautify', 'beautify', 0.5], ['glamourStyle', 'Glamour Style', 'glamourStyle', 0.9],
    ]);
    expect(await eventBilling(tenant, event.id)).toMatchObject({ addOns: ['glamourStyle'], watermark: true, amountDueCents: 1500 });
  });

  it('no charge until it’s offered; offering it adds $15 to the event checkout, watermarked until paid', async () => {
    const { tenant, event } = await setup('genie');
    expect(await eventBilling(tenant, event.id)).toMatchObject({ addOns: [], addOnsDue: [], amountDueCents: 1500 });
    expect((await PATCH(req('/x', { method: 'PATCH', body: GLAMOUR }), ev(event.id))).status).toBe(200);
    expect(await eventBilling(tenant, event.id)).toMatchObject({ addOns: ['glamourStyle'], addOnsDue: [{ id: 'glamourStyle', name: 'Glamour Style', cents: 1500 }], amountDueCents: 3000 });
    let b = await buildEventBundle(tenant.id, event.id);
    // Sent before paying (try it), with the watermark; under its new name
    expect(b.ok && b.bundle.watermark).toBeTruthy();
    expect(b.ok && (b.bundle.filters as any).filters.find((f: any) => f.id === 'glamourStyle')).toEqual({ id: 'glamourStyle', name: 'Glamour Style', steps: [{ type: 'glamourStyle', intensity: 0.7 }] });

    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(200);
    expect(created[0].line_items.map((l: any) => [l.price_data.product_data.name.split(':')[0], l.price_data.unit_amount])).toEqual([['Genie event', 1500], ['Glamour Style', 1500]]);
    expect(created[0].metadata).toMatchObject({ ipads: '2', addOns: 'glamourStyle' });
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '2', addOns: 'glamourStyle' }, 3000));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ watermark: false, addOnsDue: [], amountDueCents: 0 });
    b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && 'watermark' in b.bundle).toBe(false);
    const dash = await (await DASH(req('/x'), ev(event.id))).json();
    expect(dash.billing.history[0]).toMatchObject({ amountCents: 3000, addOns: ['Glamour Style'] });
  });

  it('added after the event is paid: its own checkout, no iPads, watermark until paid', async () => {
    const { tenant, event } = await setup('genie');
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '2' }, 1500));
    await PATCH(req('/x', { method: 'PATCH', body: GLAMOUR }), ev(event.id));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paid: true, watermark: true, amountDueCents: 1500 });
    await PAY(req('/x', { body: {} }), ev(event.id));
    expect(created[0].line_items.map((l: any) => l.price_data.unit_amount)).toEqual([1500]);
    expect(created[0].metadata).toMatchObject({ ipads: '0', addOns: 'glamourStyle' });
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '0', addOns: 'glamourStyle' }, 1500));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ watermark: false, payments: 1, ipadsCovered: 2 });
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).maxDevices).toBe(2);
  });

  it('Genius accounts that don’t pay per event still pay for it; Super Admin sets the price', async () => {
    await prisma.systemSetting.create({ data: { key: 'addon_price_cents_glamour_style', value: '900' } });
    const { tenant, event } = await setup('crm');
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paysPerEvent: false, watermark: false });
    await PATCH(req('/x', { method: 'PATCH', body: GLAMOUR }), ev(event.id));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paysPerEvent: false, watermark: true, amountDueCents: 900 });
    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(200);
    expect(created[0].line_items.map((l: any) => l.price_data.unit_amount)).toEqual([900]);
  });

  it('events that used the free filter before keep it free; Duplicate doesn’t copy that; comps cover it', async () => {
    const { tenant, event } = await setup('genie');
    await PATCH(req('/x', { method: 'PATCH', body: GLAMOUR }), ev(event.id));
    await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { addOnsIncluded: ['glamourStyle'] } });
    expect(await eventBilling(tenant, event.id)).toMatchObject({ addOnsDue: [], amountDueCents: 1500 });

    const copy = await seedEvent(tenant.id, (await boothEventsClient(tenant.id)).id);
    await prisma.eventGenieSettings.deleteMany({ where: { eventId: copy.id } });
    await prisma.$transaction(tx => copyGenieSetup(tx, event.id, copy.id, tenant.id));
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: copy.id } })).addOnsIncluded).toEqual([]);
    expect(await eventBilling(tenant, copy.id)).toMatchObject({ addOnsDue: [{ id: 'glamourStyle' }] });

    await compEvent(copy.id);
    expect(await eventBilling(tenant, copy.id)).toMatchObject({ watermark: false, addOnsDue: [] });
  });
});

describe('fee waivers (Super Admin)', () => {
  it('a waived operator is never charged for Glamour Style and has no watermark for it; removing the waiver brings the charge back', async () => {
    const { tenant, event } = await setup('genie');
    await PATCH(req('/x', { method: 'PATCH', body: GLAMOUR }), ev(event.id));
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '2' }, 1500));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ watermark: true, amountDueCents: 1500 });
    const waive = (waived: boolean) => TENANT(req('/x', { method: 'PATCH', body: { addOnWaiver: { id: 'glamourStyle', waived } } }), { params: Promise.resolve({ id: tenant.id }) });

    expect((await waive(true)).status).toBe(403);
    globalRole = 'SUPER_ADMIN';
    expect((await waive(true)).status).toBe(200);
    const since = ((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).addOnWaivers as any).glamourStyle;
    expect(Date.parse(since)).toBeGreaterThan(Date.now() - 60_000);
    expect(await eventBilling(tenant, event.id)).toMatchObject({ watermark: false, addOnsDue: [], amountDueCents: 0 });
    const b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && 'watermark' in b.bundle).toBe(false);
    // Waiving again keeps the original date; listed in Genie Usage
    await waive(true);
    expect(((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).addOnWaivers as any).glamourStyle).toBe(since);
    expect((await (await USAGE(req('/api/super-admin/genie-usage'))).json()).waivers).toEqual([{ tenantId: tenant.id, operator: expect.any(String), addOnId: 'glamourStyle', addOn: 'Glamour Style', since }]);
    expect((await TENANT(req('/x', { method: 'PATCH', body: { addOnWaiver: { id: 'nope', waived: true } } }), { params: Promise.resolve({ id: tenant.id }) })).status).toBe(400);

    await waive(false);
    expect(await eventBilling(tenant, event.id)).toMatchObject({ watermark: true, amountDueCents: 1500 });
    expect((await (await USAGE(req('/api/super-admin/genie-usage'))).json()).waivers).toEqual([]);
  });
});

describe('Glamour Style available (Super Admin, once Genie 0.6.0 is out)', () => {
  it('off: can’t be chosen, and an event that has it doesn’t send it to iPads (older ones reject the bundle)', async () => {
    const { tenant, event } = await setup('genie');
    await PATCH(req('/x', { method: 'PATCH', body: { filters: { ...GLAMOUR.filters, defaultFilterId: 'glamourStyle' } } }), ev(event.id));
    await prisma.systemSetting.update({ where: { key: 'glamour_style_ready' }, data: { value: 'off' } });
    const b = await buildEventBundle(tenant.id, event.id);
    expect(JSON.stringify(b.ok && b.bundle)).not.toContain('glamourStyle');
    expect(b.ok && (b.bundle.filters as any).defaultFilterId).toBe('original');
    expect((await (await DASH(req('/x'), ev(event.id))).json()).billing.glamourStyleReady).toBe(false);
    // Kept on the event that has it; a new one can't choose it
    expect((await PATCH(req('/x', { method: 'PATCH', body: GLAMOUR }), ev(event.id))).status).toBe(200);
    const other = await seedEvent(tenant.id, (await boothEventsClient(tenant.id)).id);
    expect((await PATCH(req('/x', { method: 'PATCH', body: GLAMOUR }), ev(other.id))).status).toBe(400);
  });
});

describe('before/after on the guest session page', () => {
  it('a galleryOriginal upload becomes the gallery image’s “before”, and is in no photo list', async () => {
    const { event } = await setup('genie');
    const { token } = await seedDevice(event.tenantId);
    const session = guestSession();
    async function upload(kind: string, extra: Record<string, unknown> = {}) {
      const clientId = randomUUID();
      const u = await uploadUrl(req('/x', { token, body: { clientId, fileName: kind + '.jpg', contentType: 'image/jpeg', bytes: 800_000 } }), { params: Promise.resolve({ eventId: event.id }) });
      const { storageKey } = await u.json();
      objects.set(storageKey, 800_000);
      return registerAsset(req('/x', { token, body: { clientId, session, kind, fileName: kind + '.jpg', contentType: 'image/jpeg', bytes: 800_000, width: 1200, height: 1800,
        sha256: 'a'.repeat(64), capturedAt: '2026-12-12T23:41:10Z', storageKey, ...extra } }), { params: Promise.resolve({ eventId: event.id }) });
    }
    const g = await upload('gallery');
    expect(g.status).toBe(201);
    const { sessionUrl } = await g.json();
    const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId: event.id } });
    const open = async () => (await sessionPage(req('/x'), { params: Promise.resolve({ token: gallery.clientToken, sessionToken: sessionUrl.split('/s/')[1] }) })).json();
    expect((await open()).assets[0].originalUrl).toBeUndefined();

    expect((await upload('galleryOriginal')).status).toBe(201);
    const page = await open();
    expect(page.assets).toHaveLength(1);
    expect(page.assets[0]).toMatchObject({ isGallery: true, originalUrl: expect.stringContaining('https://media.boothgen.test/') });
    expect(page.assets[0].originalUrl).not.toBe(page.assets[0].url);

    await prisma.galleryAsset.updateMany({ where: { galleryId: gallery.id }, data: { approvalStatus: 'APPROVED' } });
    await prisma.gallery.update({ where: { id: gallery.id }, data: { isPublished: true } });
    const list = await (await galleryPage(req('/x'), { params: Promise.resolve({ token: gallery.clientToken }) })).json();
    const text = JSON.stringify(list);
    expect(text).toContain(page.assets[0].url);
    expect(text).not.toContain(page.assets[0].originalUrl);
  });
});
