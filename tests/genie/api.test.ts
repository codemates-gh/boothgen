import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

const objects = new Map<string, number>();
vi.mock('@/lib/storage/r2', () => ({
  getPresignedUploadUrl: vi.fn(async (key: string) => 'https://r2.test/upload/' + key + '?sig=1'),
  headR2Object: vi.fn(async (key: string) => (objects.has(key) ? { bytes: objects.get(key)! } : null)),
  r2PublicUrl: (key: string) => 'https://media.boothgen.test/' + key,
}));
const inngestSend = vi.fn(async (_: unknown) => ({ ids: [] }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: (e: unknown) => inngestSend(e) } }));

import { prisma } from '@/lib/prisma/client';
import { POST as pair } from '@/app/api/genie/device/pair/route';
import { GET as listEvents } from '@/app/api/genie/events/route';
import { GET as getConfig } from '@/app/api/genie/config/route';
import { GET as getBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { POST as uploadUrl } from '@/app/api/genie/events/[eventId]/upload-url/route';
import { POST as registerAsset } from '@/app/api/genie/events/[eventId]/assets/route';
import { POST as createShare } from '@/app/api/genie/events/[eventId]/shares/route';
import { POST as reportPrints } from '@/app/api/genie/events/[eventId]/print-log/route';
import { guestSession, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const GENIE_SHARED = process.env.GENIE_SHARED_DIR ?? '/Volumes/EXT1TB_Samsung/dev/Genie/shared';
const ev = (eventId: string) => ({ params: { eventId } });

beforeEach(async () => {
  await resetDb();
  objects.clear();
  inngestSend.mockClear();
});
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

async function setup(opts: Parameters<typeof seedTenant>[0] = {}) {
  const { tenant, client } = await seedTenant(opts);
  const event = await seedEvent(tenant.id, client.id);
  const { device, token } = await seedDevice(tenant.id);
  return { tenant, client, event, device, token };
}

function uploadBody(eventKeyPrefix: string, session = guestSession(), overrides: Record<string, unknown> = {}) {
  const clientId = randomUUID();
  const storageKey = eventKeyPrefix + 'genie-' + clientId + '-shot.jpg';
  objects.set(storageKey, 1234);
  return {
    clientId, session, kind: 'shot', shotIndex: 0, storageKey, fileName: 'shot.jpg', contentType: 'image/jpeg',
    bytes: 1234, width: 1800, height: 1200, sha256: 'a'.repeat(64), capturedAt: '2026-12-12T23:41:10Z', ...overrides,
  };
}

async function keyPrefix(tenantId: string, eventId: string) {
  const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId } });
  return 'galleries/' + tenantId + '/' + gallery.id + '/';
}

describe('device auth', () => {
  it('rejects missing, unknown and revoked tokens', async () => {
    const { tenant } = await setup();
    const revoked = await seedDevice(tenant.id, { revoked: true });
    expect((await listEvents(req('/api/genie/events'))).status).toBe(401);
    expect((await listEvents(req('/api/genie/events', { token: 'gn_nope' }))).status).toBe(401);
    const res = await listEvents(req('/api/genie/events', { token: revoked.token }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'device_revoked' });
  });

  it('returns 403 genie_not_enabled when the tenant lacks the add-on', async () => {
    const { token } = await setup({ genieEnabled: false });
    const res = await listEvents(req('/api/genie/events', { token }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'genie_not_enabled' });
  });

  it('updates lastSeenAt and returns device config', async () => {
    const { device, token } = await setup();
    const res = await getConfig(req('/api/genie/config', { token }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deviceId: device.id, deviceName: 'Booth iPad', attendantPinHash: '', minAppVersion: '1.0.0' });
    expect((await prisma.genieDevice.findUniqueOrThrow({ where: { id: device.id } })).lastSeenAt).not.toBeNull();
  });
});

describe('pairing', () => {
  const body = (code: string) => ({ code, deviceName: 'Booth iPad', deviceModel: 'iPad7,3', appVersion: '1.0.0' });

  it('exchanges a code once for a working token', async () => {
    const { tenant } = await seedTenant();
    await prisma.geniePairingCode.create({ data: { tenantId: tenant.id, code: 'ABC123', expiresAt: new Date(Date.now() + 600000) } });
    const res = await pair(req('/api/genie/device/pair', { body: body('ABC123') }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tenantName).toBe(tenant.name);
    const device = await prisma.genieDevice.findUniqueOrThrow({ where: { id: json.deviceId } });
    expect(device.tokenHash).not.toBe(json.token);
    expect((await listEvents(req('/api/genie/events', { token: json.token }))).status).toBe(200);
    expect((await pair(req('/api/genie/device/pair', { body: body('ABC123') }))).status).toBe(410);
  });

  it('rejects expired codes and malformed requests', async () => {
    const { tenant } = await seedTenant();
    await prisma.geniePairingCode.create({ data: { tenantId: tenant.id, code: 'OLD999', expiresAt: new Date(Date.now() - 1000) } });
    expect((await pair(req('/api/genie/device/pair', { body: body('OLD999') }))).status).toBe(410);
    expect((await pair(req('/api/genie/device/pair', { body: body('abc') }))).status).toBe(400);
  });
});

describe('tenant isolation', () => {
  it('never exposes another tenant’s events', async () => {
    const a = await setup();
    const b = await setup();
    const list = await (await listEvents(req('/api/genie/events', { token: a.token }))).json();
    expect(list.events.map((e: any) => e.id)).toEqual([a.event.id]);
    expect((await getBundle(req(`/api/genie/events/${b.event.id}/bundle`, { token: a.token }), ev(b.event.id))).status).toBe(404);
    const up = { clientId: randomUUID(), fileName: 'x.jpg', contentType: 'image/jpeg', bytes: 10 };
    expect((await uploadUrl(req(`/api/genie/events/${b.event.id}/upload-url`, { token: a.token, body: up }), ev(b.event.id))).status).toBe(404);
    const print = { id: randomUUID(), prints: 3, periodStart: '2026-12-12T23:00:00Z', periodEnd: '2026-12-12T23:30:00Z' };
    expect((await reportPrints(req(`/api/genie/events/${b.event.id}/print-log`, { token: a.token, body: print }), ev(b.event.id))).status).toBe(404);
  });

  it('rejects storage keys issued for another tenant', async () => {
    const a = await setup();
    const b = await setup();
    await getBundle(req(`/api/genie/events/${b.event.id}/bundle`, { token: b.token }), ev(b.event.id));
    await getBundle(req(`/api/genie/events/${a.event.id}/bundle`, { token: a.token }), ev(a.event.id));
    const body = uploadBody(await keyPrefix(b.tenant.id, b.event.id));
    const res = await registerAsset(req(`/api/genie/events/${a.event.id}/assets`, { token: a.token, body }), ev(a.event.id));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'invalid_storage_key' });
  });

  it('refuses a session id that belongs to another tenant', async () => {
    const a = await setup();
    const b = await setup();
    const session = guestSession();
    await getBundle(req(`/api/genie/events/${a.event.id}/bundle`, { token: a.token }), ev(a.event.id));
    await getBundle(req(`/api/genie/events/${b.event.id}/bundle`, { token: b.token }), ev(b.event.id));
    const first = uploadBody(await keyPrefix(a.tenant.id, a.event.id), session);
    expect((await registerAsset(req(`/api/genie/events/${a.event.id}/assets`, { token: a.token, body: first }), ev(a.event.id))).status).toBe(201);
    const second = uploadBody(await keyPrefix(b.tenant.id, b.event.id), session);
    const res = await registerAsset(req(`/api/genie/events/${b.event.id}/assets`, { token: b.token, body: second }), ev(b.event.id));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'session_conflict' });
  });
});

describe('bundle', () => {
  it('returns 200 with an ETag, then 304 for a matching If-None-Match', async () => {
    const { event, token } = await setup();
    const res = await getBundle(req(`/api/genie/events/${event.id}/bundle`, { token }), ev(event.id));
    expect(res.status).toBe(200);
    const etag = res.headers.get('etag');
    expect(etag).toBe('"1"');
    const again = await getBundle(req(`/api/genie/events/${event.id}/bundle`, { token, headers: { 'if-none-match': etag! } }), ev(event.id));
    expect(again.status).toBe(304);
  });

  it('bumps bundleVersion when the content changes', async () => {
    const { event, token } = await setup();
    await getBundle(req(`/api/genie/events/${event.id}/bundle`, { token }), ev(event.id));
    await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { shotCount: 4 } });
    const res = await getBundle(req(`/api/genie/events/${event.id}/bundle`, { token, headers: { 'if-none-match': '"1"' } }), ev(event.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('"2"');
    expect((await res.json()).bundleVersion).toBe(2);
    const same = await getBundle(req(`/api/genie/events/${event.id}/bundle`, { token }), ev(event.id));
    expect((await same.json()).bundleVersion).toBe(2);
  });

  it('returns 409 without Genie settings or without templates', async () => {
    const { tenant, client } = await seedTenant();
    const { token } = await seedDevice(tenant.id);
    const noSettings = await seedEvent(tenant.id, client.id, { settings: false });
    const noTemplates = await seedEvent(tenant.id, client.id, { templates: 0 });
    const r1 = await getBundle(req(`/api/genie/events/${noSettings.id}/bundle`, { token }), ev(noSettings.id));
    const r2 = await getBundle(req(`/api/genie/events/${noTemplates.id}/bundle`, { token }), ev(noTemplates.id));
    expect([r1.status, r2.status]).toEqual([409, 409]);
    const list = await (await listEvents(req('/api/genie/events', { token }))).json();
    expect(list.events.every((e: any) => e.ready === false)).toBe(true);
  });

  it('flags events whose latest client design is not approved', async () => {
    const { tenant, event, token } = await setup();
    await prisma.templateDesign.create({ data: { tenantId: tenant.id, eventId: event.id, fileUrl: 'https://x.test/a.png', filename: 'a.png', status: 'PENDING_APPROVAL' } });
    const list = await (await listEvents(req('/api/genie/events', { token }))).json();
    expect(list.events[0]).toMatchObject({ id: event.id, ready: true, designApprovalPending: true });
  });

  it.skipIf(!existsSync(path.join(GENIE_SHARED, 'schemas')))('validates against the Genie EventBundle schema', async () => {
    const { event, token } = await setup();
    await prisma.eventGenieTemplate.create({
      data: { tenantId: event.tenantId, eventId: event.id, name: 'Landscape', sortOrder: 1, layout: { format: '4x6', orientation: 'landscape', widthPx: 1800, heightPx: 1200, dpi: 300, backgroundColor: '#112233', slots: [{ id: 'a', shotIndex: 0, x: 0, y: 0, width: 900, height: 1200, rotationDegrees: -5, fit: 'fit' }] } },
    });
    await prisma.eventGenieSettings.update({
      where: { eventId: event.id },
      data: {
        processing: [{ type: 'sharpen', radius: 1.5, intensity: 0.3 }, { type: 'jpegQuality', quality: 0.9 }],
        guestFiltersEnabled: true,
        filters: [{ id: 'original', name: 'Original', steps: [] }, { id: 'bw', name: 'B&W', steps: [{ type: 'colorPreset', preset: 'blackAndWhite', intensity: 1 }] }],
      },
    });
    const bundle = await (await getBundle(req(`/api/genie/events/${event.id}/bundle`, { token }), ev(event.id))).json();

    const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
    addFormats(ajv);
    const dir = path.join(GENIE_SHARED, 'schemas');
    for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) ajv.addSchema(JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
    const validate = ajv.getSchema('https://schemas.boothgenius.com/genie/v1/EventBundle.json')!;
    expect(validate(bundle), ajv.errorsText(validate.errors)).toBe(true);
    expect(bundle.templates.map((t: any) => t.name)).toEqual(['Template 1', 'Landscape']);
    expect(bundle.validUntil).toBe('2026-12-14T03:00:00.000Z');
    expect(bundle.sharing.sessionUrlTemplate).toMatch(/^https:\/\/boothgen\.test\/g\/[^/]+\/s\/\{token\}$/);
  });
});

describe('uploads and asset registration', () => {
  it('requires Pro for upload URLs', async () => {
    const { event, token } = await setup({ pro: false });
    const res = await uploadUrl(req(`/api/genie/events/${event.id}/upload-url`, { token, body: { clientId: randomUUID(), fileName: 'a.jpg', contentType: 'image/jpeg', bytes: 10 } }), ev(event.id));
    expect(res.status).toBe(403);
  });

  it('issues a stable key per clientId and registers the asset once', async () => {
    const { tenant, event, token } = await setup();
    const clientId = randomUUID();
    const upBody = { clientId, fileName: 'shot 1.jpg', contentType: 'image/jpeg', bytes: 1234 };
    const up1 = await (await uploadUrl(req(`/api/genie/events/${event.id}/upload-url`, { token, body: upBody }), ev(event.id))).json();
    const up2 = await (await uploadUrl(req(`/api/genie/events/${event.id}/upload-url`, { token, body: upBody }), ev(event.id))).json();
    expect(up1.storageKey).toBe(up2.storageKey);
    expect(up1.storageKey.startsWith(await keyPrefix(tenant.id, event.id))).toBe(true);

    const body = { ...uploadBody(await keyPrefix(tenant.id, event.id)), clientId, storageKey: up1.storageKey };
    objects.set(up1.storageKey, 1234);
    const r1 = await registerAsset(req(`/api/genie/events/${event.id}/assets`, { token, body }), ev(event.id));
    const r2 = await registerAsset(req(`/api/genie/events/${event.id}/assets`, { token, body }), ev(event.id));
    expect([r1.status, r2.status]).toEqual([201, 200]);
    const [j1, j2] = [await r1.json(), await r2.json()];
    expect(j2).toEqual(j1);
    expect(j1.sessionUrl).toContain('/s/' + body.session.publicToken);
    expect(await prisma.galleryAsset.count({ where: { clientId } })).toBe(1);
    const galleryCopy = uploadBody(await keyPrefix(tenant.id, event.id), body.session, { kind: 'gallery', shotIndex: undefined });
    expect((await registerAsset(req(`/api/genie/events/${event.id}/assets`, { token, body: galleryCopy }), ev(event.id))).status).toBe(201);
    expect(await prisma.galleryAsset.findFirstOrThrow({ where: { clientId: galleryCopy.clientId } })).toMatchObject({ genieKind: 'gallery', sortOrder: 0 });
    expect(await prisma.genieSession.count({ where: { clientId: body.session.id } })).toBe(1);
    const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(gallery.approvalStatus).toBe('PENDING_REVIEW');
  });

  it('returns 422 when the object is missing or the size differs', async () => {
    const { tenant, event, token } = await setup();
    await getBundle(req(`/api/genie/events/${event.id}/bundle`, { token }), ev(event.id));
    const prefix = await keyPrefix(tenant.id, event.id);
    const missing = uploadBody(prefix);
    objects.delete(missing.storageKey);
    const r1 = await registerAsset(req(`/api/genie/events/${event.id}/assets`, { token, body: missing }), ev(event.id));
    expect(await r1.json()).toMatchObject({ code: 'object_missing' });
    const wrong = uploadBody(prefix, guestSession(), { bytes: 999 });
    const r2 = await registerAsset(req(`/api/genie/events/${event.id}/assets`, { token, body: wrong }), ev(event.id));
    expect(r2.status).toBe(422);
    expect(await r2.json()).toMatchObject({ code: 'size_mismatch' });
  });
});

describe('shares', () => {
  const share = (session: ReturnType<typeof guestSession>, overrides: Record<string, unknown> = {}) => ({
    id: randomUUID(), session, channel: 'sms', destination: '+14155550123', firstName: 'Sam',
    smsConsentAt: '2026-12-12T23:42:10Z', createdAt: '2026-12-12T23:42:10Z', ...overrides,
  });

  it('refuses SMS without consent and invalid destinations', async () => {
    const { event, token } = await setup();
    const { smsConsentAt: _, ...noConsent } = share(guestSession());
    const r1 = await createShare(req(`/api/genie/events/${event.id}/shares`, { token, body: noConsent }), ev(event.id));
    expect(r1.status).toBe(422);
    expect(await r1.json()).toMatchObject({ code: 'consent_required' });
    const r2 = await createShare(req(`/api/genie/events/${event.id}/shares`, { token, body: share(guestSession(), { destination: '4155550123' }) }), ev(event.id));
    expect(await r2.json()).toMatchObject({ code: 'invalid_destination' });
    const r3 = await createShare(req(`/api/genie/events/${event.id}/shares`, { token, body: share(guestSession(), { channel: 'email', destination: 'nope', smsConsentAt: undefined }) }), ev(event.id));
    expect(await r3.json()).toMatchObject({ code: 'invalid_destination' });
    expect(await prisma.genieShare.count({ where: { eventId: event.id } })).toBe(0);
  });

  it('stores consent, is idempotent and dispatches once the session has a photo', async () => {
    const { tenant, event, token } = await setup();
    const session = guestSession();
    const body = share(session);
    const r1 = await createShare(req(`/api/genie/events/${event.id}/shares`, { token, body }), ev(event.id));
    const r2 = await createShare(req(`/api/genie/events/${event.id}/shares`, { token, body }), ev(event.id));
    expect([r1.status, r2.status]).toEqual([202, 202]);
    expect(await r2.json()).toEqual({ id: body.id, status: 'queued' });
    const stored = await prisma.genieShare.findUniqueOrThrow({ where: { clientId: body.id } });
    expect(stored.smsConsentAt?.toISOString()).toBe('2026-12-12T23:42:10.000Z');
    expect(stored.smsConsentText).toContain('I agree');
    expect(inngestSend).not.toHaveBeenCalled();

    await registerAsset(req(`/api/genie/events/${event.id}/assets`, { token, body: uploadBody(await keyPrefix(tenant.id, event.id), session) }), ev(event.id));
    expect(inngestSend).toHaveBeenCalledTimes(1);
    expect(inngestSend.mock.calls[0][0]).toEqual([{ id: 'genie-share-' + stored.id, name: 'genie/share.send', data: { shareId: stored.id } }]);
  });

  it('refuses a disabled channel', async () => {
    const { event, token } = await setup();
    await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { smsEnabled: false } });
    const res = await createShare(req(`/api/genie/events/${event.id}/shares`, { token, body: share(guestSession()) }), ev(event.id));
    expect(await res.json()).toMatchObject({ code: 'channel_disabled' });
  });
});

describe('print log', () => {
  it('adds prints once per report id with source genie', async () => {
    const { event, token } = await setup();
    const entry = { id: randomUUID(), prints: 12, periodStart: '2026-12-12T23:00:00Z', periodEnd: '2026-12-12T23:30:00Z' };
    const r1 = await reportPrints(req(`/api/genie/events/${event.id}/print-log`, { token, body: entry }), ev(event.id));
    const r2 = await reportPrints(req(`/api/genie/events/${event.id}/print-log`, { token, body: entry }), ev(event.id));
    expect(await r1.json()).toEqual({ printCount: 12 });
    expect(await r2.json()).toEqual({ printCount: 12 });
    const r3 = await reportPrints(req(`/api/genie/events/${event.id}/print-log`, { token, body: { ...entry, id: randomUUID(), prints: 5 } }), ev(event.id));
    expect(await r3.json()).toEqual({ printCount: 17 });
    expect(await prisma.eventPrintLog.findUniqueOrThrow({ where: { eventId: event.id } })).toMatchObject({ printCount: 17, source: 'genie' });
  });
});

describe('device storage reporting', () => {
  it('records free/total storage headers and flags low storage', async () => {
    const { device, token } = await setup();
    await getConfig(req('/api/genie/config', { token, headers: { 'x-genie-storage-free': String(3 * 1024 ** 3), 'x-genie-storage-total': String(64 * 1024 ** 3) } }));
    const d = await prisma.genieDevice.findUniqueOrThrow({ where: { id: device.id } });
    expect(d.storageFreeBytes).toBe(BigInt(3 * 1024 ** 3));
    const { isLowStorage } = await import('@/lib/genie/auth');
    expect(isLowStorage(d)).toBe(true);
    expect(isLowStorage({ storageFreeBytes: BigInt(40 * 1024 ** 3), storageTotalBytes: BigInt(64 * 1024 ** 3) })).toBe(false);
  });
});
