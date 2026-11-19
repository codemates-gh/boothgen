import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

let session: Record<string, unknown> = {};
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => session) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));

import { prisma } from '@/lib/prisma/client';
import { POST as DUPLICATE } from '@/app/api/events/[id]/duplicate/route';
import { req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const dup = (id: string) => DUPLICATE(req('/x', { method: 'POST' }), { params: Promise.resolve({ id }) });

beforeEach(resetDb);
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Duplicate Event', () => {
  it('copies the Genie setup (settings and templates) but not iPads, payments, the bundle version or the client design link', async () => {
    const { tenant, client } = await seedTenant();
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', userId: 'u1' };
    const event = await seedEvent(tenant.id, client.id, { templates: 2 });
    await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: {
      shotCount: 4, customCapture: true, customPoses: true, posesEnabled: true, poseIds: ['her-01', 'two-02'],
      propsEnabled: true, propIds: ['glasses'], attract: { kind: 'image' }, countdownSound: null,
      bundleVersion: 7, bundleHash: 'abc', maxDevices: 5, lockedAt: new Date(),
    } });
    const [first] = await prisma.eventGenieTemplate.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } });
    await prisma.eventGenieTemplate.update({ where: { id: first.id }, data: { designId: 'design-1', version: 3, libraryTemplateId: 'lib-1' } });
    const { device } = await seedDevice(tenant.id);
    await prisma.genieEventDevice.create({ data: { tenantId: tenant.id, eventId: event.id, deviceId: device.id } });

    const r = await dup(event.id);
    expect(r.status).toBe(201);
    const { id, genie } = await r.json();
    expect(genie).toBe(true);

    const s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: id } });
    expect(s).toMatchObject({
      timeZone: 'America/Los_Angeles', shotCount: 4, customCapture: true, customPoses: true, posesEnabled: true,
      poseIds: ['her-01', 'two-02'], propsEnabled: true, propIds: ['glasses'], attract: { kind: 'image' }, countdownSound: null,
      bundleVersion: 1, bundleHash: null, lockedAt: null, maxDevices: 2,
    });
    const copies = await prisma.eventGenieTemplate.findMany({ where: { eventId: id }, orderBy: { sortOrder: 'asc' } });
    expect(copies.map(t => [t.name, t.libraryTemplateId, t.designId, t.version])).toEqual([['Template 1', 'lib-1', null, 1], ['Template 2', null, null, 1]]);
    expect(copies[0].layout).toEqual(first.layout);
    expect(await prisma.genieEventDevice.count({ where: { eventId: id } })).toBe(0);
    // The original is untouched
    expect(await prisma.eventGenieTemplate.count({ where: { eventId: event.id } })).toBe(2);
  });

  it('an event without Genie copies as before', async () => {
    const { tenant, client } = await seedTenant();
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', userId: 'u1' };
    const event = await seedEvent(tenant.id, client.id, { settings: false, templates: 0 });
    const { id, genie } = await (await dup(event.id)).json();
    expect(genie).toBe(false);
    expect(await prisma.event.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'LEAD', title: 'Rivera Wedding (copy)', venueName: 'The Glasshouse' });
    expect(await prisma.eventGenieSettings.findUnique({ where: { eventId: id } })).toBeNull();
  });
});
