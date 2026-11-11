import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));

import { prisma } from '@/lib/prisma/client';
import { GET as getBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { GET as listEvents } from '@/app/api/genie/events/route';
import { GET as listSlots, PATCH as patchSlot } from '@/app/api/events/[id]/genie/devices/route';
import { req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

beforeEach(resetDb);
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

async function setup() {
  const { tenant, client } = await seedTenant();
  sessionTenantId = tenant.id;
  const event = await seedEvent(tenant.id, client.id);
  const devices = await Promise.all([1, 2, 3].map(() => seedDevice(tenant.id)));
  const bundle = (token: string) => getBundle(req(`/api/genie/events/${event.id}/bundle`, { token }), { params: { eventId: event.id } });
  return { tenant, event, devices, bundle };
}

describe('per-event device limit', () => {
  it('gives slots to the first two devices and refuses the third', async () => {
    const { devices, bundle } = await setup();
    expect((await bundle(devices[0].token)).status).toBe(200);
    expect((await bundle(devices[1].token)).status).toBe(200);
    expect((await bundle(devices[0].token)).status).toBe(200); // repeat keeps its slot
    const third = await bundle(devices[2].token);
    expect(third.status).toBe(409);
    expect(await third.json()).toMatchObject({ code: 'event_device_limit' });
  });

  it("lists the account's other paired iPads as available for the event", async () => {
    const { event, devices, bundle } = await setup();
    const other = await seedTenant();
    await seedDevice(other.tenant.id);
    await prisma.genieDevice.update({ where: { id: devices[2].device.id }, data: { revokedAt: new Date() } });
    await bundle(devices[0].token);
    const d = await (await listSlots(req('/x'), { params: { id: event.id } })).json();
    expect(d.devices.map((x: any) => x.id)).toEqual([devices[0].device.id]);
    expect(d.available.map((x: any) => x.id)).toEqual([devices[1].device.id]);
  });

  it('never hands out more slots than the limit under concurrent requests', async () => {
    const { event, tenant, bundle } = await setup();
    const more = await Promise.all([1, 2, 3, 4, 5].map(() => seedDevice(tenant.id)));
    const statuses = (await Promise.all(more.map(d => bundle(d.token)))).map(r => r.status);
    expect(statuses.filter(s => s === 200)).toHaveLength(2);
    expect(await prisma.genieEventDevice.count({ where: { eventId: event.id, releasedAt: null } })).toBe(2);
  });

  it('flags full events in the device’s event list', async () => {
    const { devices, bundle } = await setup();
    await bundle(devices[0].token);
    await bundle(devices[1].token);
    const mine = (await (await listEvents(req('/api/genie/events', { token: devices[0].token }))).json()).events[0];
    const other = (await (await listEvents(req('/api/genie/events', { token: devices[2].token }))).json()).events[0];
    expect(mine).toMatchObject({ assignedToThisDevice: true, deviceSlotsAvailable: 0, maxDevices: 2 });
    expect(other).toMatchObject({ assignedToThisDevice: false, deviceSlotsAvailable: 0 });
  });

  it('release frees the slot, blocks the released device, and allow undoes it', async () => {
    const { event, devices, bundle } = await setup();
    await bundle(devices[0].token);
    await bundle(devices[1].token);
    const patch = (deviceId: string, action: string) => patchSlot(new NextRequest('https://boothgen.test/x', { method: 'PATCH', body: JSON.stringify({ deviceId, action }) }), { params: { id: event.id } });

    expect((await patch(devices[0].device.id, 'release')).status).toBe(200);
    const released = await bundle(devices[0].token);
    expect(released.status).toBe(409);
    expect(await released.json()).toMatchObject({ code: 'event_device_released' });
    expect((await bundle(devices[2].token)).status).toBe(200); // freed slot goes to the third iPad

    const slots = await (await listSlots(new NextRequest('https://boothgen.test/x'), { params: { id: event.id } })).json();
    expect(slots).toMatchObject({ maxDevices: 2, used: 2 });

    await patch(devices[0].device.id, 'allow');
    expect((await bundle(devices[0].token)).status).toBe(409); // allowed again, but both slots are taken
    expect(await (await bundle(devices[0].token)).json()).toMatchObject({ code: 'event_device_limit' });
  });

  it('honours a per-event limit', async () => {
    const { event, devices, bundle } = await setup();
    await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { maxDevices: 3 } });
    for (const d of devices) expect((await bundle(d.token)).status).toBe(200);
  });
});
