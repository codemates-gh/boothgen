import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Genie-only stage 2a: booth events made from Genie → Events, without a CRM client (docs/genie/genie-only-plan.md)

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));

import { prisma } from '@/lib/prisma/client';
import { GET as EVENTS, POST as CREATE } from '@/app/api/genie-events/route';
import { PATCH, DELETE } from '@/app/api/genie-events/[id]/route';
import { GET as DASH } from '@/app/api/events/[id]/genie/route';
import { BOOTH_CLIENT_EMAIL, zonedTime } from '@/lib/genie/boothEvents';
import { genieOnlyBlock } from '@/lib/product';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const p = (id: string) => ({ params: { id } });
const body = { title: 'Lee Sweet 16', date: '2027-03-20', startTime: '18:30', endTime: '00:30', venueName: 'Hall B', timeZone: 'America/Los_Angeles' };
const create = (b: unknown = body) => CREATE(req('/api/genie-events', { method: 'POST', body: b }));

async function setup() {
  const t = await seedTenant();
  sessionTenantId = t.tenant.id;
  return t;
}

beforeEach(resetDb);
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('local times', () => {
  it('turns a wall-clock time in a time zone into the instant, across daylight saving', () => {
    expect(zonedTime('2027-03-20', '18:30', 'America/Los_Angeles').toISOString()).toBe('2027-03-21T01:30:00.000Z'); // PDT
    expect(zonedTime('2027-01-20', '18:30', 'America/Los_Angeles').toISOString()).toBe('2027-01-21T02:30:00.000Z'); // PST
    expect(zonedTime('2027-06-01', '09:00', 'UTC').toISOString()).toBe('2027-06-01T09:00:00.000Z');
  });
});

describe('new booth event', () => {
  it('creates the event on the account\'s one "Booth events" client, with Genie set up', async () => {
    const { tenant } = await setup();
    const res = await create();
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const e = await prisma.event.findUniqueOrThrow({ where: { id }, include: { client: true, genieSettings: true } });
    expect(e).toMatchObject({ tenantId: tenant.id, title: 'Lee Sweet 16', status: 'BOOKED', venueName: 'Hall B' });
    expect(e.client.email).toBe(BOOTH_CLIENT_EMAIL);
    expect(e.eventDate.toISOString()).toBe('2027-03-20T00:00:00.000Z');
    expect(e.startTime!.toISOString()).toBe('2027-03-21T01:30:00.000Z');
    expect(e.endTime!.toISOString()).toBe('2027-03-21T07:30:00.000Z'); // ends after midnight: next day
    expect(e.genieSettings).toMatchObject({ enabled: true, timeZone: 'America/Los_Angeles' });

    // A second event reuses the same client
    const { id: id2 } = await (await create({ ...body, title: 'Second', startTime: null, endTime: null, venueName: null })).json();
    const e2 = await prisma.event.findUniqueOrThrow({ where: { id: id2 } });
    expect(e2.clientId).toBe(e.clientId);
    expect(e2.startTime).toBeNull();
    expect(await prisma.client.count({ where: { tenantId: tenant.id, email: BOOTH_CLIENT_EMAIL } })).toBe(1);
  });

  it('lists booth events without a client name and flags them on the Genie page', async () => {
    const { tenant, client } = await setup();
    const { id } = await (await create({ ...body, date: '2099-01-01' })).json();
    await seedEvent(tenant.id, client.id); // a CRM event (Rivera Wedding, Ana Rivera)
    const rows = (await (await EVENTS(req('/api/genie-events'))).json()).events;
    const booth = rows.find((r: any) => r.id === id);
    expect(booth).toMatchObject({ boothEvent: true, clientName: null });
    expect(rows.find((r: any) => r.id !== id)).toMatchObject({ boothEvent: false, clientName: 'Ana Rivera' });
    const dash = await (await DASH(req('/x'), p(id))).json();
    expect(dash.event).toMatchObject({ boothEvent: true, venueName: 'Hall B' });
  });

  it('refuses a missing name, a bad date or an unknown time zone', async () => {
    await setup();
    expect((await create({ ...body, title: ' ' })).status).toBe(400);
    expect((await create({ ...body, date: '03/20/2027' })).status).toBe(400);
    expect((await create({ ...body, timeZone: 'Mars/Base' })).status).toBe(400);
    expect((await create({ ...body, startTime: '25:00' })).status).toBe(400);
  });

  it('is open to Genie-only accounts', () => {
    expect(genieOnlyBlock('/api/genie-events')).toBeNull();
    expect(genieOnlyBlock('/api/genie-events/abc')).toBeNull();
  });
});

describe('editing and deleting a booth event', () => {
  const edit = (id: string, b: unknown) => PATCH(req('/x', { method: 'PATCH', body: b }), p(id));
  const { timeZone: _, ...editBody } = body;

  it('changes the details in the event\'s time zone', async () => {
    await setup();
    const { id } = await (await create()).json();
    expect((await edit(id, { ...editBody, title: 'Lee Sweet Sixteen', startTime: '19:00', endTime: '23:00', venueName: null })).status).toBe(200);
    const e = await prisma.event.findUniqueOrThrow({ where: { id } });
    expect(e).toMatchObject({ title: 'Lee Sweet Sixteen', venueName: null });
    expect(e.startTime!.toISOString()).toBe('2027-03-21T02:00:00.000Z');
    expect(e.endTime!.toISOString()).toBe('2027-03-21T06:00:00.000Z');
  });

  it('keeps the date and times once the event has started, but allows a new name', async () => {
    await setup();
    const { id } = await (await create()).json();
    await prisma.eventGenieSettings.update({ where: { eventId: id }, data: { lockedAt: new Date() } });
    const res = await edit(id, { ...editBody, startTime: '20:00' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('locked');
    expect((await edit(id, { ...editBody, title: 'Renamed' })).status).toBe(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id } })).title).toBe('Renamed');
  });

  it('deletes an event without photos, not one with photos, and never a CRM event', async () => {
    const { tenant, client } = await setup();
    const { id } = await (await create()).json();
    expect((await DELETE(req('/x', { method: 'DELETE' }), p(id))).status).toBe(200);
    expect(await prisma.event.count({ where: { id } })).toBe(0);

    const { id: withPhotos } = await (await create()).json();
    const gallery = await prisma.gallery.create({ data: { tenantId: tenant.id, eventId: withPhotos, title: 'G' } });
    await prisma.genieSession.create({ data: { tenantId: tenant.id, eventId: withPhotos, galleryId: gallery.id, clientId: randomUUID(), publicToken: randomUUID(), startedAt: new Date() } });
    const res = await DELETE(req('/x', { method: 'DELETE' }), p(withPhotos));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('has_photos');

    const crm = await seedEvent(tenant.id, client.id);
    expect((await DELETE(req('/x', { method: 'DELETE' }), p(crm.id))).status).toBe(404);
    expect((await edit(crm.id, editBody)).status).toBe(404);
  });

  it('stays inside the account', async () => {
    await setup();
    const { id } = await (await create()).json();
    await setup(); // another account signed in
    expect((await edit(id, editBody)).status).toBe(404);
    expect((await DELETE(req('/x', { method: 'DELETE' }), p(id))).status).toBe(404);
  });
});
