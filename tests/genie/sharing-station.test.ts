import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Genie P12: Sharing station for PC booth software (Release A)

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
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
import { eventBilling, recordCheckout, PAYMENT_KIND } from '@/lib/genie/payments';
import { boothEventsClient } from '@/lib/genie/boothEvents';
import { POST as PAY } from '@/app/api/genie-events/[id]/pay/route';
import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { POST as uploadUrl } from '@/app/api/genie/events/[eventId]/upload-url/route';
import { POST as registerAsset } from '@/app/api/genie/events/[eventId]/assets/route';
import { GET as sessionPage } from '@/app/api/g/[token]/s/[sessionToken]/route';
import { bundleValidator, guestSession, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const MB = 1024 * 1024;
const ev = (id: string) => ({ params: Promise.resolve({ id }) });
const evId = (eventId: string) => ({ params: Promise.resolve({ eventId }) });
const SHARING = { recentMinutes: null, blurGrid: false, uploadAll: false };

async function setup(product: 'genie' | 'crm' = 'genie') {
  const t = await seedTenant({ pro: product === 'crm' });
  await prisma.tenant.update({ where: { id: t.tenant.id }, data: { product } });
  sessionTenantId = t.tenant.id;
  const client = product === 'genie' ? await boothEventsClient(t.tenant.id) : t.client;
  const event = await seedEvent(t.tenant.id, client.id);
  const { token } = await seedDevice(t.tenant.id);
  return { tenant: { ...t.tenant, product }, event, token };
}
const checkout = (tenantId: string, eventId: string, meta: Record<string, string>, amount: number) => ({
  id: 'cs_test_' + randomUUID(), payment_status: 'paid', amount_total: amount, currency: 'usd', metadata: { kind: PAYMENT_KIND, tenantId, eventId, ...meta },
} as any);

beforeEach(async () => { await resetDb(); created.length = 0; objects.clear(); await prisma.systemSetting.deleteMany({ where: { key: { in: ['genie_event_price_cents', 'genius_pays_per_event'] } } }); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('event options and bundle', () => {
  it('always in the bundle (valid against the Genie schema); the options are off by default and change the version', async () => {
    const { tenant, event } = await setup();
    let b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && b.bundle.sharingStation).toEqual({ enabled: true });
    expect((await (await DASH(req('/x'), ev(event.id))).json()).settings.sharingStation).toEqual(SHARING);
    const v1 = b.ok ? b.bundleVersion : 0;

    expect((await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: { recentMinutes: 15, blurGrid: true, uploadAll: true } } }), ev(event.id))).status).toBe(200);
    b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && b.bundle.sharingStation).toEqual({ enabled: true, recentMinutes: 15, blurGrid: true, uploadAll: true });
    expect(b.ok && b.bundleVersion).toBeGreaterThan(v1);
    const validate = await bundleValidator();
    if (validate && b.ok) expect(validate(b.bundle)).toBeNull();
    expect((await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: { ...SHARING, recentMinutes: 2 } } }), ev(event.id))).status).toBe(400);
    // No on/off switch or PC count any more (2.113.0)
    expect((await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: { ...SHARING, enabled: true, pcs: 1 } } }), ev(event.id))).status).toBe(400);
  });

  it('ignores the old account switch-off (Tenant.sharingStationOff)', async () => {
    const { tenant, event } = await setup();
    await prisma.tenant.update({ where: { id: tenant.id }, data: { sharingStationOff: true } });
    const b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && b.bundle.sharingStation).toEqual({ enabled: true });
  });
});

describe('billing: included with the Genie event', () => {
  it('Genie-only: the event payment alone clears the watermark; no Sharing station line in checkout', async () => {
    const { tenant, event } = await setup('genie');
    expect(await eventBilling(tenant, event.id)).toMatchObject({ watermark: true, paid: false });
    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(200);
    expect(created[0].line_items.map((l: any) => [l.quantity, l.price_data.unit_amount])).toEqual([[1, 1500]]);
    expect(created[0].metadata).toMatchObject({ ipads: '2' });
    expect(created[0].metadata.sharingPcs).toBeUndefined();
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '2' }, 1500));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paid: true, watermark: false, ipadsCovered: 2 });
    const b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && 'watermark' in b.bundle).toBe(false);
    expect(b.ok && b.bundle.sharingStation).toEqual({ enabled: true });
    // Paid: only more iPads can be bought
    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(409);
    expect((await PAY(req('/x', { body: { moreIpads: true } }), ev(event.id))).status).toBe(200);
  });

  it('Genius accounts pay $10 for the event, nothing more', async () => {
    await prisma.systemSetting.upsert({ where: { key: 'genius_pays_per_event' }, create: { key: 'genius_pays_per_event', value: 'on' }, update: { value: 'on' } });
    const { tenant, event } = await setup('crm');
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paysPerEvent: true, priceCents: 1000 });
    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(200);
    expect(created[0].line_items.map((l: any) => [l.quantity, l.price_data.unit_amount])).toEqual([[1, 1000]]);
  });

  it('Genius accounts that don’t pay per event pay nothing and have no watermark', async () => {
    const { tenant, event } = await setup('crm');
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paysPerEvent: false, watermark: false });
    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(409);
  });

  it('an old 2.112.0 Sharing station-only payment adds no iPads and doesn’t count as paying for the event', async () => {
    const { tenant, event } = await setup('genie');
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '0', sharingPcs: '1' }, 1200));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paid: false, watermark: true, ipadsCovered: 2 });
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).maxDevices).toBe(2);
  });
});

describe('PC booth photos', () => {
  async function upload(eventId: string, token: string, body: Record<string, unknown>) {
    const u = await uploadUrl(req('/x', { token, body: { clientId: body.clientId, fileName: body.fileName, contentType: body.contentType, bytes: body.bytes } }), evId(eventId));
    if (u.status !== 200) return u;
    const { storageKey } = await u.json();
    objects.set(storageKey, body.bytes as number);
    return registerAsset(req('/x', { token, body: { ...body, storageKey } }), evId(eventId));
  }
  const base = (over: Record<string, unknown> = {}) => ({
    clientId: randomUUID(), session: guestSession(), kind: 'gallery', fileName: 'IMG_0412.jpg', contentType: 'image/jpeg', bytes: 900_000,
    width: 2400, height: 1600, sha256: 'b'.repeat(64), capturedAt: '2026-12-12T23:41:10Z',
    source: 'pcBooth', boothId: 'box-1', boothName: 'Booth 1', sourceSha256: 'c'.repeat(64), sourceFileName: 'IMG_0412.JPG', ...over,
  });

  it('stores the source, keeps one copy per PC file, and opens the session page without waiting for more', async () => {
    const { event, token } = await setup();
    const r = await upload(event.id, token, base());
    expect(r.status).toBe(201);
    const first = await r.json();
    const a = await prisma.galleryAsset.findUniqueOrThrow({ where: { id: first.assetId } });
    expect(a).toMatchObject({ source: 'pcBooth', boothId: 'box-1', boothName: 'Booth 1', sourceSha256: 'c'.repeat(64), sourceFileName: 'IMG_0412.JPG', genieKind: 'gallery' });

    // A second iPad shares the same PC photo: the existing asset (and session link) comes back
    const again = await upload(event.id, token, base());
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);
    expect(await prisma.galleryAsset.count({ where: { sourceSha256: 'c'.repeat(64) } })).toBe(1);

    const token_ = first.sessionUrl.split('/s/')[1];
    const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId: event.id } });
    const page = await (await sessionPage(req('/x'), { params: Promise.resolve({ token: gallery.clientToken, sessionToken: token_ }) })).json();
    expect([page.assets.length, page.morePending]).toEqual([1, false]);
  });

  it('accepts GIFs and videos (up to 50 MB) with their poster; other files stay at 15 MB', async () => {
    const { event, token } = await setup();
    const session = guestSession();
    expect((await upload(event.id, token, base({ session, kind: 'gif', contentType: 'image/gif', fileName: 'loop.gif', bytes: 4 * MB, sourceSha256: 'd'.repeat(64) }))).status).toBe(201);
    const bigPhoto = await uploadUrl(req('/x', { token, body: { clientId: randomUUID(), fileName: 'big.jpg', contentType: 'image/jpeg', bytes: 20 * MB } }), evId(event.id));
    expect(bigPhoto.status).toBe(400);

    const vSession = guestSession();
    const video = await upload(event.id, token, base({ session: vSession, kind: 'video', contentType: 'video/mp4', fileName: 'clip.mp4', bytes: 40 * MB, durationMs: 6000, sourceSha256: 'e'.repeat(64) }));
    expect(video.status).toBe(201);
    expect((await upload(event.id, token, base({ session: vSession, kind: 'videoPoster', fileName: 'poster.jpg', bytes: 200_000, sourceSha256: 'e'.repeat(64) }))).status).toBe(201);
    const v = await prisma.galleryAsset.findUniqueOrThrow({ where: { id: (await video.json()).assetId } });
    expect([v.assetType, v.durationMs, v.thumbnailUrl?.endsWith('poster.jpg')]).toEqual(['VIDEO', 6000, true]);
    const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId: event.id } });
    const page = await (await sessionPage(req('/x'), { params: Promise.resolve({ token: gallery.clientToken, sessionToken: vSession.publicToken }) })).json();
    expect(page.assets.map((x: any) => !!x.isBoomerang)).toEqual([true]);
    expect(page.morePending).toBe(false);
    // A 40 MB GIF is refused (only videos may be over 15 MB)
    expect((await upload(event.id, token, base({ kind: 'gif', contentType: 'image/gif', fileName: 'huge.gif', bytes: 40 * MB, sourceSha256: 'f'.repeat(64) }))).status).toBe(400);
  });
});
