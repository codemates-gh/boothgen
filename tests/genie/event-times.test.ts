import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

let session: Record<string, unknown> = {};
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => session) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/trigger', () => ({ triggerAutomation: vi.fn(async () => {}), scheduleEventDateAutomations: vi.fn(async () => {}) }));

import { prisma } from '@/lib/prisma/client';
import { POST as CREATE_EVENT } from '@/app/api/events/route';
import { PATCH as UPDATE_EVENT } from '@/app/api/events/[id]/route';
import { POST as CREATE_BOOTH } from '@/app/api/genie-events/route';
import { POST as DUPLICATE } from '@/app/api/events/[id]/duplicate/route';
import { GET as DEVICE_EVENTS } from '@/app/api/genie/events/route';
import { GET as DEVICE_BUNDLE } from '@/app/api/genie/events/[eventId]/bundle/route';
import { GET as DASH, PATCH as PATCH_GENIE } from '@/app/api/events/[id]/genie/route';
import { POST as ADD_TEMPLATE } from '@/app/api/events/[id]/genie/templates/route';
import { PUT as TEMPLATE_TEXT } from '@/app/api/events/[id]/genie/template-text/route';
import { PATCH as PATCH_BOOTH } from '@/app/api/genie-events/[id]/route';
import { ensureGallery } from '@/lib/genie/bundle';
import { eventSpan, moveEventTo, todayIn } from '@/lib/eventTimes';
import { zonedTime as zonedForTest } from '@/lib/genie/boothEvents';
import { req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const HOURS = 3600_000;
const ev = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(resetDb);
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('start and end', () => {
  it('rolls an overnight end to the next day, takes an End Date, and allows at most 48 hours', () => {
    expect(eventSpan({ date: '2026-12-12', startTime: '20:00', endTime: '01:00' })).toEqual({ startTime: new Date('2026-12-12T20:00:00Z'), endTime: new Date('2026-12-13T01:00:00Z') });
    expect(eventSpan({ date: '2026-12-12', startTime: '10:00', endDate: '2026-12-14', endTime: '10:00' })).toEqual({ startTime: new Date('2026-12-12T10:00:00Z'), endTime: new Date('2026-12-14T10:00:00Z') });
    expect(eventSpan({ date: '2026-12-12', startTime: '10:00', endDate: '2026-12-14', endTime: '10:01' })).toEqual({ error: 'An event can last at most 48 hours' });
    expect(eventSpan({ date: '2026-12-12', startTime: '10:00', endDate: '2026-12-12', endTime: '09:00' })).toEqual({ error: 'The event must end after it starts' });
    expect(eventSpan({ date: '2026-12-12', endDate: '2026-12-11', endTime: '09:00' })).toMatchObject({ error: expect.stringMatching(/before the start/) });
    expect(eventSpan({ date: '2026-12-12', endDate: '2026-12-13' })).toMatchObject({ error: expect.stringMatching(/end time/) });
    expect(eventSpan({ date: '2026-12-12' })).toEqual({ startTime: null, endTime: null });
  });

  it('the event form and booth events save Start/End Date and Time and refuse more than 48 hours', async () => {
    const { tenant, client } = await seedTenant();
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', userId: 'u1' };
    const base = { clientId: client.id, title: 'Two-day fair', eventDate: '2026-12-12', startTime: '09:00' };
    const r = await CREATE_EVENT(req('/x', { body: { ...base, endDate: '2026-12-13', endTime: '18:00' } }));
    expect(r.status).toBe(201);
    const saved = await prisma.event.findUniqueOrThrow({ where: { id: (await r.json()).id } });
    expect([saved.startTime, saved.endTime]).toEqual([new Date('2026-12-12T09:00:00Z'), new Date('2026-12-13T18:00:00Z')]);
    expect((await CREATE_EVENT(req('/x', { body: { ...base, endDate: '2026-12-15', endTime: '18:00' } }))).status).toBe(400);
    const tooLong = await UPDATE_EVENT(req('/x', { method: 'PATCH', body: { ...base, status: 'BOOKED', endDate: '2026-12-14', endTime: '12:00', email: '' } }), ev(saved.id));
    expect((await tooLong.json()).error).toMatch(/48 hours/);

    const booth = await CREATE_BOOTH(req('/x', { body: { title: 'Night market', date: '2026-12-12', startTime: '18:00', endDate: '2026-12-14', endTime: '02:00', timeZone: 'America/Los_Angeles' } }));
    expect(booth.status).toBe(201);
    const b = await prisma.event.findUniqueOrThrow({ where: { id: (await booth.json()).id } });
    expect([b.startTime, b.endTime]).toEqual([zonedForTest('2026-12-12', '18:00', 'America/Los_Angeles'), zonedForTest('2026-12-14', '02:00', 'America/Los_Angeles')]);
    expect((await CREATE_BOOTH(req('/x', { body: { title: 'Too long', date: '2026-12-12', startTime: '18:00', endDate: '2026-12-14', endTime: '18:01', timeZone: 'UTC' } }))).status).toBe(400);
  });
});

describe('expired events', () => {
  it('an event auto-completed while still running stays on iPads, reported as IN_PROGRESS', async () => {
    const { tenant, client } = await seedTenant();
    const { token } = await seedDevice(tenant.id);
    const running = await seedEvent(tenant.id, client.id);
    const now = Date.now();
    await prisma.event.update({ where: { id: running.id }, data: { status: 'COMPLETED', eventDate: new Date(new Date(now - 2 * HOURS).toISOString().slice(0, 10)), startTime: new Date(now - 2 * HOURS), endTime: new Date(now + HOURS) } });
    const list = await (await DEVICE_EVENTS(req('/x', { token }))).json();
    expect(list.events.map((e: any) => [e.id, e.status])).toEqual([[running.id, 'IN_PROGRESS']]);
  });

  it('48 hours after its start an event drops off the iPad list and no iPad can download it, even one running it', async () => {
    const { tenant, client } = await seedTenant();
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', userId: 'u1' };
    const { token, device } = await seedDevice(tenant.id);
    const other = await seedDevice(tenant.id);
    const recent = await seedEvent(tenant.id, client.id);
    const old = await seedEvent(tenant.id, client.id);
    const now = Date.now();
    // Its end time passed, but it started 34 h ago: still In Progress
    await prisma.event.update({ where: { id: recent.id }, data: { title: 'Recent', eventDate: new Date(new Date(now - 34 * HOURS).toISOString().slice(0, 10)), startTime: new Date(now - 34 * HOURS), endTime: new Date(now - 30 * HOURS) } });
    await prisma.event.update({ where: { id: old.id }, data: { title: 'Old', eventDate: new Date(new Date(now - 54 * HOURS).toISOString().slice(0, 10)), startTime: new Date(now - 54 * HOURS), endTime: new Date(now - 49 * HOURS) } });
    await prisma.genieEventDevice.create({ data: { tenantId: tenant.id, eventId: old.id, deviceId: device.id } });

    expect((await (await DEVICE_EVENTS(req('/x', { token }))).json()).events.map((e: any) => e.id)).toEqual([recent.id]);
    const ok = await DEVICE_BUNDLE(req('/x', { token: other.token }), { params: Promise.resolve({ eventId: recent.id }) });
    expect(ok.status).toBe(200);
    expect(Date.parse((await ok.json()).validUntil)).toBe(now - 34 * HOURS + 48 * HOURS);
    const refused = await DEVICE_BUNDLE(req('/x', { token }), { params: Promise.resolve({ eventId: old.id }) });
    expect([refused.status, (await refused.json()).code]).toEqual([409, 'event_expired']);

    const d = await (await DASH(req('/x'), ev(old.id))).json();
    expect([d.expired, d.ended, !!d.settings]).toEqual([true, true, true]);
    expect(await (await DASH(req('/x'), ev(recent.id))).json()).toMatchObject({ expired: false, ended: false });
  });

  it("a Past event's setup and details can't change at all", async () => {
    const { tenant, client } = await seedTenant();
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', userId: 'u1' };
    const booth = await CREATE_BOOTH(req('/x', { body: { title: 'Last night', date: '2026-01-10', startTime: '18:00', endTime: '23:00', timeZone: 'UTC' } }));
    const id = (await booth.json()).id;
    const ended = await PATCH_GENIE(req('/x', { method: 'PATCH', body: { timeZone: 'America/Chicago' } }), ev(id));
    expect([ended.status, (await ended.json()).code]).toEqual([409, 'ended']);
    expect((await ADD_TEMPLATE(req('/x', { body: { libraryTemplateId: 'x' } }), ev(id))).status).toBe(409);
    expect((await TEMPLATE_TEXT(req('/x', { method: 'PUT', body: { answers: { Names: 'A & B' } } }), ev(id))).status).toBe(409);
    const moved = await PATCH_BOOTH(req('/x', { method: 'PATCH', body: { title: 'Last night', date: '2099-12-20', startTime: '18:00', endTime: '23:00' } }), ev(id));
    expect([moved.status, (await moved.json()).code]).toEqual([409, 'ended']);
  });

  it('an In Progress event keeps its setup editable, but not its date and times', async () => {
    const { tenant, client } = await seedTenant();
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', userId: 'u1' };
    const today = new Date().toISOString().slice(0, 10);
    const booth = await CREATE_BOOTH(req('/x', { body: { title: 'Tonight', date: today, startTime: '00:00', timeZone: 'UTC' } }));
    const id = (await booth.json()).id;
    expect((await PATCH_GENIE(req('/x', { method: 'PATCH', body: { timeZone: 'UTC' } }), ev(id))).status).toBe(200);
    const moved = await PATCH_BOOTH(req('/x', { method: 'PATCH', body: { title: 'Tonight', date: '2099-12-20', startTime: '18:00' } }), ev(id));
    expect([moved.status, (await moved.json()).code]).toEqual([409, 'locked']);
    expect((await PATCH_BOOTH(req('/x', { method: 'PATCH', body: { title: 'Renamed', date: today, startTime: '00:00' } }), ev(id))).status).toBe(200);
  });

  it('Duplicate starts the copy today with the same times and length, also from an expired event; booth copies are booked', async () => {
    const { tenant, client } = await seedTenant();
    session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', userId: 'u1' };
    // CRM event (clock times): 20:00 to 01:00 the next day, long ago
    const crm = await seedEvent(tenant.id, client.id, { settings: false, templates: 0 });
    await prisma.event.update({ where: { id: crm.id }, data: { eventDate: new Date('2026-01-10'), startTime: new Date('2026-01-10T20:00:00Z'), endTime: new Date('2026-01-11T01:00:00Z') } });
    const copy = await prisma.event.findUniqueOrThrow({ where: { id: (await (await DUPLICATE(req('/x', { method: 'POST' }), ev(crm.id))).json()).id } });
    const nextDay = (d: string) => new Date(Date.parse(d + 'T00:00:00Z') + 24 * HOURS).toISOString().slice(0, 10);
    // Today, unless today's start time already passed: then tomorrow, so the copy can still be moved
    const nyToday = todayIn('America/New_York');
    const today = Date.parse(`${nyToday}T20:00:00Z`) > Date.now() ? nyToday : nextDay(nyToday);
    expect(copy.eventDate.toISOString().slice(0, 10)).toBe(today);
    expect(copy.startTime!.toISOString()).toBe(`${today}T20:00:00.000Z`);
    expect(copy.endTime!.getTime() - copy.startTime!.getTime()).toBe(5 * HOURS);
    expect(copy.status).toBe('LEAD');

    // Booth event in Los Angeles, expired
    const booth = await CREATE_BOOTH(req('/x', { body: { title: 'Old booth', date: '2026-01-10', startTime: '18:00', endTime: '23:30', timeZone: 'America/Los_Angeles' } }));
    const boothId = (await booth.json()).id;
    expect((await (await DASH(req('/x'), ev(boothId))).json()).expired).toBe(true);
    const r = await DUPLICATE(req('/x', { method: 'POST' }), ev(boothId));
    expect(r.status).toBe(201);
    const bc = await prisma.event.findUniqueOrThrow({ where: { id: (await r.json()).id }, include: { genieSettings: true } });
    const laNow = todayIn('America/Los_Angeles');
    const laToday = zonedForTest(laNow, '18:00', 'America/Los_Angeles').getTime() > Date.now() ? laNow : nextDay(laNow);
    expect(bc.eventDate.toISOString().slice(0, 10)).toBe(laToday);
    expect(bc.startTime).toEqual(zonedForTest(laToday, '18:00', 'America/Los_Angeles'));
    expect(bc.endTime).toEqual(zonedForTest(laToday, '23:30', 'America/Los_Angeles'));
    expect([bc.status, bc.genieSettings?.timeZone]).toEqual(['BOOKED', 'America/Los_Angeles']);
    // The moved times keep a next-day end on the next day
    const moved = moveEventTo({ eventDate: new Date('2026-01-10'), setupTime: null, startTime: new Date('2026-01-10T20:00:00Z'), endTime: new Date('2026-01-11T01:00:00Z') }, '2026-03-05', 'UTC', (d, t) => new Date(`${d}T${t}:00Z`));
    expect(moved.endTime).toEqual(new Date('2026-03-06T01:00:00Z'));
  });
});
