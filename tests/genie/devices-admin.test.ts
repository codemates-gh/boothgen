import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));

import { prisma } from '@/lib/prisma/client';
import { GET as LIST } from '@/app/api/genie-devices/route';
import { POST as NEW_CODE } from '@/app/api/genie-devices/pairing-code/route';
import { PATCH as RENAME, DELETE as REMOVE } from '@/app/api/genie-devices/[deviceId]/route';
import { PUT as SET_PIN } from '@/app/api/genie-devices/pin/route';
import { POST as PAIR } from '@/app/api/genie/device/pair/route';
import { GET as CONFIG } from '@/app/api/genie/config/route';
import { GET as DEVICE_BUNDLE } from '@/app/api/genie/events/[eventId]/bundle/route';
import { GET as MESSAGING } from '@/app/api/settings/genie-messaging/route';
import { verifyAttendantPin } from '@/lib/genie/pin';
import { req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const dp = (deviceId: string) => ({ params: { deviceId } });
const pair = (code: string, ip: string) => PAIR(req('/api/genie/device/pair', { body: { code, deviceName: 'Booth iPad', deviceModel: 'iPad13,8', appVersion: '1.0.0' }, headers: { 'x-forwarded-for': ip } }));

beforeEach(async () => { await resetDb(); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Genie devices page: pairing codes', () => {
  it('creates a 10-minute code that pairs once; a new code replaces the old one', async () => {
    const { tenant } = await seedTenant();
    sessionTenantId = tenant.id;
    const r1 = await NEW_CODE();
    expect(r1.status).toBe(201);
    const first = await r1.json();
    expect(first.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const ttl = new Date(first.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(9 * 60_000);
    expect(ttl).toBeLessThanOrEqual(10 * 60_000);
    expect((await (await LIST()).json()).pairingCode.code).toBe(first.code);

    const second = await (await NEW_CODE()).json();
    expect((await pair(first.code, '10.0.0.1')).status).toBe(410);
    expect((await pair(second.code, '10.0.0.2')).status).toBe(200);
    expect((await pair(second.code, '10.0.0.3')).status).toBe(410);
    const list = await (await LIST()).json();
    expect(list.pairingCode).toBeNull();
    expect(list.devices).toHaveLength(1);
  });

  it('requires the Genie add-on', async () => {
    const { tenant } = await seedTenant({ genieEnabled: false });
    sessionTenantId = tenant.id;
    expect((await NEW_CODE()).status).toBe(403);
    expect((await LIST()).status).toBe(403);
    expect(await prisma.geniePairingCode.count({ where: { tenantId: tenant.id } })).toBe(0);
  });
});

describe('Genie devices page: list, rename, remove', () => {
  it("lists only this tenant's paired iPads with storage and current event", async () => {
    const { tenant, client } = await seedTenant();
    sessionTenantId = tenant.id;
    const { device } = await seedDevice(tenant.id);
    await seedDevice(tenant.id, { revoked: true });
    const other = await seedTenant();
    await seedDevice(other.tenant.id);
    const event = await seedEvent(tenant.id, client.id);
    await prisma.genieEventDevice.create({ data: { tenantId: tenant.id, eventId: event.id, deviceId: device.id } });
    await prisma.genieDevice.update({ where: { id: device.id }, data: { storageFreeBytes: BigInt(3 * 1024 ** 3), storageTotalBytes: BigInt(64 * 1024 ** 3) } });

    const list = await (await LIST()).json();
    expect(list.devices).toHaveLength(1);
    expect(list.devices[0]).toMatchObject({ id: device.id, name: 'Booth iPad', model: 'iPad7,3', appVersion: '1.0.0', lowStorage: true, currentEvent: { id: event.id, title: 'Rivera Wedding' } });
    expect(JSON.stringify(list)).not.toContain('tokenHash');
  });

  it('renames with validation, never across tenants', async () => {
    const { tenant } = await seedTenant();
    sessionTenantId = tenant.id;
    const { device } = await seedDevice(tenant.id);
    const rename = (name: unknown, id = device.id) => RENAME(req('/x', { method: 'PATCH', body: { name } }), dp(id));
    expect((await rename('   ')).status).toBe(400);
    expect((await rename('x'.repeat(81))).status).toBe(400);
    expect((await rename(42)).status).toBe(400);
    expect((await rename('  Booth 1  ')).status).toBe(200);
    expect((await prisma.genieDevice.findUniqueOrThrow({ where: { id: device.id } })).name).toBe('Booth 1');

    sessionTenantId = (await seedTenant()).tenant.id;
    expect((await rename('Mine now')).status).toBe(404);
    expect((await REMOVE(req('/x', { method: 'DELETE' }), dp(device.id))).status).toBe(404);
    expect((await prisma.genieDevice.findUniqueOrThrow({ where: { id: device.id } })).revokedAt).toBeNull();
  });

  it('removing an iPad stops its token and frees its event spots', async () => {
    const { tenant, client } = await seedTenant();
    sessionTenantId = tenant.id;
    const { device, token } = await seedDevice(tenant.id);
    const event = await seedEvent(tenant.id, client.id);
    const bundle = () => DEVICE_BUNDLE(req(`/api/genie/events/${event.id}/bundle`, { token }), { params: { eventId: event.id } });
    expect((await bundle()).status).toBe(200);
    expect(await prisma.genieEventDevice.count({ where: { deviceId: device.id, releasedAt: null } })).toBe(1);

    expect((await REMOVE(req('/x', { method: 'DELETE' }), dp(device.id))).status).toBe(200);
    const after = await bundle();
    expect(after.status).toBe(401);
    expect((await after.json()).code).toBe('device_revoked');
    expect(await prisma.genieEventDevice.count({ where: { deviceId: device.id, releasedAt: null } })).toBe(0);
    expect((await REMOVE(req('/x', { method: 'DELETE' }), dp(device.id))).status).toBe(404);
    expect((await (await LIST()).json()).devices).toHaveLength(0);
  });
});

describe('Genie devices page: attendant PIN', () => {
  it('sets, validates and clears the PIN that iPads sync', async () => {
    const { tenant } = await seedTenant();
    sessionTenantId = tenant.id;
    const { token } = await seedDevice(tenant.id);
    const setPin = (pin: unknown) => SET_PIN(req('/x', { method: 'PUT', body: { pin } }));
    for (const bad of ['123', '123456789', '12a4', 1234]) expect((await setPin(bad)).status).toBe(400);
    expect((await setPin('2468')).status).toBe(200);
    const hash = (await (await CONFIG(req('/api/genie/config', { token }))).json()).attendantPinHash;
    expect(verifyAttendantPin('2468', hash)).toBe(true);
    expect((await (await LIST()).json()).pinSet).toBe(true);
    expect((await setPin(null)).status).toBe(200);
    expect((await (await CONFIG(req('/api/genie/config', { token }))).json()).attendantPinHash).toBe('');
  });
});

describe('Settings → Genie: From address on the platform domain', () => {
  it('shows a domain problem instead of Tested and hides email on the iPad', async () => {
    const { tenant, client } = await seedTenant();
    sessionTenantId = tenant.id;
    await prisma.genieMessagingConfig.update({ where: { tenantId: tenant.id }, data: { emailFromAddress: 'info@boothgen.com', emailTestedAt: new Date() } });
    const view = await (await MESSAGING()).json();
    expect(view.email.domainError).toContain("can't send from boothgen.com");

    const event = await seedEvent(tenant.id, client.id);
    const { token } = await seedDevice(tenant.id);
    const bundle = await (await DEVICE_BUNDLE(req(`/api/genie/events/${event.id}/bundle`, { token }), { params: { eventId: event.id } })).json();
    expect(bundle.sharing.emailEnabled).toBe(false);

    await prisma.genieMessagingConfig.update({ where: { tenantId: tenant.id }, data: { emailFromAddress: 'photos@snap.test' } });
    expect((await (await MESSAGING()).json()).email.domainError).toBeNull();
  });
});
