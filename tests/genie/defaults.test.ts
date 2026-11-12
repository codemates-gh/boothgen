import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));

import { prisma } from '@/lib/prisma/client';
import { GET as GET_DEFAULTS, PUT as PUT_DEFAULTS } from '@/app/api/genie-defaults/route';
import { GET as DASH, POST as SETUP, PATCH } from '@/app/api/events/[id]/genie/route';
import { GET as BUNDLE_PREVIEW } from '@/app/api/events/[id]/genie/bundle/route';
import { GET as EVENTS } from '@/app/api/genie-events/route';
import { SAMPLE_LAYOUT, bundleValidator, req, resetDb, seedEvent, seedTenant } from './helpers';

const json = (body: unknown, method = 'PUT') => req('/x', { method, body });
const p = (id: string) => ({ params: { id } });

const CAPTURE = { shotCount: 4, initialCountdownSeconds: 6, betweenShotsCountdownSeconds: 2, showPerShotPreview: true, allowPerShotRetake: false, perShotPreviewSeconds: 3, allowReviewRetake: true, retakesPerShot: 2, idleTimeoutSeconds: 90 };
const SHARING = { smsEnabled: true, emailEnabled: false, qrEnabled: true, guestLinkScope: 'all', smsBody: 'Your {{eventName}} photos: {{link}}', emailSubject: 'Photos!', emailBody: 'Here they are.', smsConsentText: 'OK to text me.' };
const PRINTING = { enabled: true, maxCopies: 3, defaultCopies: 2 };

async function setup() {
  const t = await seedTenant();
  sessionTenantId = t.tenant.id;
  return t;
}

async function libTemplate(tenantId: string | null, name = 'Lib ' + randomUUID().slice(0, 6)) {
  return prisma.boothDesignTemplate.create({ data: { tenantId, name, format: '2x6', orientation: 'portrait', isPublished: tenantId === null, layout: SAMPLE_LAYOUT } });
}

async function newEvent(tenantId: string, clientId: string, start = new Date('2026-12-12T23:00:00Z')) {
  const e = await seedEvent(tenantId, clientId, { settings: false, templates: 0 });
  await prisma.event.update({ where: { id: e.id }, data: { startTime: start } });
  return e;
}

beforeEach(async () => { await resetDb(); await prisma.boothDesignTemplate.deleteMany({ where: { name: { startsWith: 'Lib ' } } }); });
afterAll(async () => { await resetDb(); await prisma.boothDesignTemplate.deleteMany({ where: { name: { startsWith: 'Lib ' } } }); await prisma.$disconnect(); });

describe('Genie event defaults', () => {
  it('new events start from the defaults, with the brief pick first and default templates after', async () => {
    const { tenant, client } = await setup();
    const a = await libTemplate(tenant.id), b = await libTemplate(tenant.id);
    expect((await PUT_DEFAULTS(json({ timeZone: 'America/Chicago', capture: CAPTURE, sharing: SHARING, printing: PRINTING, templateIds: [a.id, b.id] }))).status).toBe(200);

    const e = await newEvent(tenant.id, client.id);
    await prisma.eventDesignBrief.create({ data: { tenantId: tenant.id, eventId: e.id, templateId: b.id } });
    expect((await SETUP(json({}, 'POST'), p(e.id))).status).toBe(201);
    const s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: e.id } });
    expect(s).toMatchObject({ timeZone: 'America/Chicago', shotCount: 4, guestLinkScope: 'all', printMaxCopies: 3, customTimeZone: false, customCapture: false, customSharing: false, customPrinting: false });
    const templates = await prisma.eventGenieTemplate.findMany({ where: { eventId: e.id }, orderBy: { sortOrder: 'asc' } });
    expect(templates.map(t => t.libraryTemplateId)).toEqual([b.id, a.id]);

    // A different time zone at setup makes just that section custom
    const e2 = await newEvent(tenant.id, client.id);
    await SETUP(json({ timeZone: 'Europe/London' }, 'POST'), p(e2.id));
    expect(await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: e2.id } })).toMatchObject({ timeZone: 'Europe/London', customTimeZone: true, customCapture: false });
  });

  it('changing a default updates events that follow it, not custom, locked or pre-existing ones', async () => {
    const { tenant, client } = await setup();
    const following = await newEvent(tenant.id, client.id);
    const customized = await newEvent(tenant.id, client.id);
    const started = await newEvent(tenant.id, client.id, new Date(Date.now() - 600_000));
    for (const e of [following, customized, started]) await SETUP(json({}, 'POST'), p(e.id));
    const preExisting = await seedEvent(tenant.id, client.id); // settings created before defaults existed

    // Custom capture on one event
    await PATCH(json({ capture: { ...CAPTURE, shotCount: 2 } }, 'PATCH'), p(customized.id));
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: customized.id } })).customCapture).toBe(true);

    const r = await (await PUT_DEFAULTS(json({ capture: CAPTURE }))).json();
    expect(r.eventsUpdated).toBe(1);
    const shot = async (id: string) => (await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: id } })).shotCount;
    expect(await shot(following.id)).toBe(4);
    expect(await shot(customized.id)).toBe(2);
    expect(await shot(started.id)).toBe(3);
    expect(await shot(preExisting.id)).toBe(3);

    // Only the changed section propagates: sharing on the following event was untouched
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: following.id } })).customSharing).toBe(false);
    await prisma.eventGenieTemplate.create({ data: { tenantId: tenant.id, eventId: following.id, name: 'T', layout: SAMPLE_LAYOUT } });
    const validate = await bundleValidator();
    if (validate) expect(validate(await (await BUNDLE_PREVIEW(req('/x'), p(following.id))).json())).toBeNull();
  });

  it('an event section is custom only while it differs, and can go back to the defaults', async () => {
    const { tenant, client } = await setup();
    await PUT_DEFAULTS(json({ printing: PRINTING }));
    const e = await newEvent(tenant.id, client.id);
    await SETUP(json({}, 'POST'), p(e.id));

    await PATCH(json({ printing: { enabled: true, maxCopies: 5, defaultCopies: 1 } }, 'PATCH'), p(e.id));
    let d = await (await DASH(req('/x'), p(e.id))).json();
    expect(d.settings.custom).toEqual({ timeZone: false, capture: false, sharing: false, printing: true });

    // Saving the same values as the defaults isn't custom
    await PATCH(json({ printing: PRINTING }, 'PATCH'), p(e.id));
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: e.id } })).customPrinting).toBe(false);

    await PATCH(json({ printing: { enabled: false, maxCopies: 1, defaultCopies: 1 } }, 'PATCH'), p(e.id));
    expect((await PATCH(json({ reset: ['printing'] }, 'PATCH'), p(e.id))).status).toBe(200);
    expect(await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: e.id } })).toMatchObject({ printingEnabled: true, printMaxCopies: 3, printDefaultCopies: 2, customPrinting: false });
    expect((await PATCH(json({ reset: ['filters'] }, 'PATCH'), p(e.id))).status).toBe(400);
  });

  it('validates defaults and keeps them per account', async () => {
    const { tenant } = await setup();
    const other = await seedTenant();
    const theirs = await libTemplate(other.tenant.id);
    const mine = await libTemplate(tenant.id);
    expect((await PUT_DEFAULTS(json({ sharing: { ...SHARING, smsBody: 'no link' } }))).status).toBe(400);
    expect((await PUT_DEFAULTS(json({ capture: { ...CAPTURE, shotCount: 11 } }))).status).toBe(400);
    expect((await PUT_DEFAULTS(json({ templateIds: [theirs.id] }))).status).toBe(404);
    expect((await PUT_DEFAULTS(json({ templateIds: [mine.id, mine.id] }))).status).toBe(400);
    expect((await PUT_DEFAULTS(json({ filters: {} }))).status).toBe(400);
    expect((await (await GET_DEFAULTS()).json()).saved).toBe(false);

    await PUT_DEFAULTS(json({ capture: CAPTURE }));
    sessionTenantId = other.tenant.id;
    expect((await (await GET_DEFAULTS()).json()).capture.shotCount).toBe(3);

    const off = await seedTenant({ genieEnabled: false });
    sessionTenantId = off.tenant.id;
    expect((await GET_DEFAULTS()).status).toBe(403);
    expect((await EVENTS(req('/api/genie-events'))).status).toBe(403);
  });
});

describe('Event Defaults page round trip', () => {
  it('saves exactly what it loaded (the page drops read-only extras)', async () => {
    await setup();
    const got = await (await GET_DEFAULTS()).json();
    expect(got).toHaveProperty('templates');
    expect(got).toHaveProperty('eventsFollowing');
    // Same fields the page sends (toForm in genie/defaults/page.tsx)
    const form = { timeZone: got.timeZone, capture: got.capture, sharing: got.sharing, printing: got.printing, templateIds: got.templateIds };
    expect((await PUT_DEFAULTS(json(form))).status).toBe(200);
    // Sending the whole GET body is rejected, which is what the page used to do
    expect((await PUT_DEFAULTS(json(got))).status).toBe(400);
  });
});

describe('Genie → Events overview', () => {
  it("lists only this account's events with their Genie status", async () => {
    const { tenant, client } = await setup();
    const ready = await seedEvent(tenant.id, client.id);
    const notSetUp = await seedEvent(tenant.id, client.id, { settings: false, templates: 0 });
    const other = await seedTenant();
    await seedEvent(other.tenant.id, other.client.id);
    await prisma.event.updateMany({ where: { tenantId: tenant.id }, data: { eventDate: new Date(Date.now() + 5 * 86400_000) } });

    const rows = (await (await EVENTS(req('/api/genie-events'))).json()).events;
    expect(rows.map((r: any) => r.id).sort()).toEqual([ready.id, notSetUp.id].sort());
    const r = rows.find((x: any) => x.id === ready.id);
    expect(r.genie).toMatchObject({ enabled: true, templates: 1, ipads: 0, maxDevices: 2, lockedAt: null, followsDefaults: false });
    expect(rows.find((x: any) => x.id === notSetUp.id).genie).toBeNull();
    expect((await (await EVENTS(req('/api/genie-events?past=1'))).json()).events).toHaveLength(0);
  });
});
