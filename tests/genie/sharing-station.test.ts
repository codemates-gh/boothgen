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
const SHARING = { enabled: true, pcs: 1, recentMinutes: null, blurGrid: false, uploadAll: false };

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

beforeEach(async () => { await resetDb(); created.length = 0; objects.clear(); await prisma.systemSetting.deleteMany({ where: { key: { in: ['genie_event_price_cents', 'genius_pays_per_event', 'sharing_station_pc_price_cents'] } } }); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('event setting and bundle', () => {
  it('off by default; on sends sharingStation (valid against the Genie schema) and the settings change the version', async () => {
    const { tenant, event } = await setup();
    let b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && 'sharingStation' in b.bundle).toBe(false);
    expect((await (await DASH(req('/x'), ev(event.id))).json()).settings.sharingStation).toEqual({ enabled: false, pcs: 1, recentMinutes: null, blurGrid: false, uploadAll: false });

    expect((await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: SHARING } }), ev(event.id))).status).toBe(200);
    b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && b.bundle.sharingStation).toEqual({ enabled: true });
    const v1 = b.ok ? b.bundleVersion : 0;
    await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: { ...SHARING, recentMinutes: 15, blurGrid: true, uploadAll: true } } }), ev(event.id));
    b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && b.bundle.sharingStation).toEqual({ enabled: true, recentMinutes: 15, blurGrid: true, uploadAll: true });
    expect(b.ok && b.bundleVersion).toBeGreaterThan(v1);
    const validate = await bundleValidator();
    if (validate && b.ok) expect(validate(b.bundle)).toBeNull();
    expect((await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: { ...SHARING, recentMinutes: 2 } } }), ev(event.id))).status).toBe(400);
  });

  it('Super Admin can switch it off for an account: it can’t be turned on and leaves the bundle', async () => {
    const { tenant, event } = await setup();
    await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: SHARING } }), ev(event.id));
    await prisma.tenant.update({ where: { id: tenant.id }, data: { sharingStationOff: true } });
    const b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && 'sharingStation' in b.bundle).toBe(false);
    const other = await seedEvent(tenant.id, (await boothEventsClient(tenant.id)).id);
    expect((await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: SHARING } }), ev(other.id))).status).toBe(400);
    expect((await (await DASH(req('/x'), ev(event.id))).json()).billing).toMatchObject({ sharingAvailable: false, sharingStation: false, amountDueCents: 1500 });
  });
});

describe('billing: $12 per PC, in the same checkout as the event', () => {
  it('Genie-only: one checkout for the event and the PC; watermark until paid; the PC payment adds no iPads', async () => {
    const { tenant, event } = await setup('genie');
    await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: SHARING } }), ev(event.id));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ watermark: true, sharingStation: true, sharingPcsDue: 1, amountDueCents: 2700 });
    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(200);
    expect(created[0].line_items.map((l: any) => [l.quantity, l.price_data.unit_amount])).toEqual([[1, 1500], [1, 1200]]);
    expect(created[0].metadata).toMatchObject({ ipads: '2', sharingPcs: '1' });

    // Paid for the event only: still watermarked while the Sharing station isn't
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '2', sharingPcs: '0' }, 1500));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paid: true, watermark: true, sharingPcsDue: 1, amountDueCents: 1200 });
    created.length = 0;
    await PAY(req('/x', { body: {} }), ev(event.id));
    expect(created[0].line_items.map((l: any) => [l.quantity, l.price_data.unit_amount])).toEqual([[1, 1200]]);
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '0', sharingPcs: '1' }, 1200));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ watermark: false, sharingPcsPaid: 1, amountDueCents: 0, ipadsCovered: 2 });
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).maxDevices).toBe(2);
    // Nothing left to pay, but more iPads can still be bought
    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(409);
    expect((await PAY(req('/x', { body: { moreIpads: true } }), ev(event.id))).status).toBe(200);
  });

  it('Genius accounts pay $10 for the event plus $12 per PC in one checkout', async () => {
    await prisma.systemSetting.upsert({ where: { key: 'genius_pays_per_event' }, create: { key: 'genius_pays_per_event', value: 'on' }, update: { value: 'on' } });
    const { tenant, event } = await setup('crm');
    await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: SHARING } }), ev(event.id));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paysPerEvent: true, priceCents: 1000, amountDueCents: 2200 });
    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(200);
    expect(created[0].line_items.map((l: any) => [l.quantity, l.price_data.unit_amount])).toEqual([[1, 1000], [1, 1200]]);
  });

  it('Genius accounts that don’t pay per event (switch off or kept free) still pay $12 per PC for the Sharing station', async () => {
    const { tenant, event } = await setup('crm');
    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(409);
    // Release A: one PC per event
    expect((await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: { ...SHARING, pcs: 2 } } }), ev(event.id))).status).toBe(400);
    await PATCH(req('/x', { method: 'PATCH', body: { sharingStation: SHARING } }), ev(event.id));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paysPerEvent: false, watermark: true, sharingPcsDue: 1, amountDueCents: 1200 });
    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(200);
    expect(created[0].line_items.map((l: any) => [l.quantity, l.price_data.unit_amount])).toEqual([[1, 1200]]);
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '0', sharingPcs: '1' }, 1200));
    const b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && 'watermark' in b.bundle).toBe(false);
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
