import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
const inngestSend = vi.fn(async (_e: unknown) => ({ ids: [] }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: (e: unknown) => inngestSend(e) } }));

import { prisma } from '@/lib/prisma/client';
import { GET as DASH, POST as SETUP, PATCH } from '@/app/api/events/[id]/genie/route';
import { POST as ADD_T, PUT as ORDER_T } from '@/app/api/events/[id]/genie/templates/route';
import { PATCH as PATCH_T, DELETE as DEL_T } from '@/app/api/events/[id]/genie/templates/[templateId]/route';
import { GET as LIBRARY } from '@/app/api/genie-templates/route';
import { GET as SHARES } from '@/app/api/events/[id]/genie/shares/route';
import { POST as RESEND } from '@/app/api/events/[id]/genie/shares/[shareId]/resend/route';
import { GET as BUNDLE_PREVIEW } from '@/app/api/events/[id]/genie/bundle/route';
import { GET as DEVICE_EVENTS } from '@/app/api/genie/events/route';
import { GET as DEVICE_BUNDLE } from '@/app/api/genie/events/[eventId]/bundle/route';
import { SAMPLE_LAYOUT, bundleValidator, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const p = (id: string) => ({ params: { id } });
const json = (path: string, method: string, body: unknown) => req(path, { method, body });

const FULL_PATCH = {
  enabled: true,
  timeZone: 'America/Chicago',
  capture: { shotCount: 3, initialCountdownSeconds: 4, betweenShotsCountdownSeconds: 2, showPerShotPreview: true, allowPerShotRetake: false, perShotPreviewSeconds: 3, allowReviewRetake: true, retakesPerShot: 2, idleTimeoutSeconds: 90 },
  filters: { guestFiltersEnabled: true, defaultFilterId: 'warm', filterIds: ['original', 'warm', 'bw'] },
  sharing: { smsEnabled: true, emailEnabled: false, qrEnabled: true, guestLinkScope: 'all', smsBody: 'Hi {{firstName}}! {{eventName}} photos until {{expiresOn}}: {{link}}', emailSubject: 'Photos from {{eventName}}', emailBody: 'Hi {{ firstName }}, here you go.', smsConsentText: 'OK to text me once.' },
  printing: { enabled: true, maxCopies: 3, defaultCopies: 2 },
};

async function setup() {
  const { tenant, client } = await seedTenant();
  sessionTenantId = tenant.id;
  const event = await seedEvent(tenant.id, client.id);
  return { tenant, client, event };
}

async function libraryTemplate(tenantId: string | null, opts: { alternate?: boolean; published?: boolean } = {}) {
  return prisma.boothDesignTemplate.create({
    data: {
      tenantId, name: 'Lib ' + randomUUID().slice(0, 6), format: '2x6', orientation: 'portrait', isPublished: opts.published ?? true,
      layout: SAMPLE_LAYOUT,
      ...(opts.alternate ? { alternateLayout: { ...SAMPLE_LAYOUT, format: '4x6', orientation: 'landscape', widthPx: 1800, heightPx: 1200 } } : {}),
    },
  });
}

beforeEach(async () => { inngestSend.mockClear(); await resetDb(); await prisma.boothDesignTemplate.deleteMany({ where: { name: { startsWith: 'Lib ' } } }); });
afterAll(async () => { await resetDb(); await prisma.boothDesignTemplate.deleteMany({ where: { name: { startsWith: 'Lib ' } } }); await prisma.$disconnect(); });

describe('Event Genie dashboard: access', () => {
  it("never shows or changes another tenant's event", async () => {
    const { event } = await setup();
    const other = await seedTenant();
    sessionTenantId = other.tenant.id;
    expect((await DASH(req('/x'), p(event.id))).status).toBe(404);
    expect((await PATCH(json('/x', 'PATCH', { enabled: false }), p(event.id))).status).toBe(404);
    expect((await SETUP(json('/x', 'POST', { timeZone: 'UTC' }), p(event.id))).status).toBe(404);
    expect((await SHARES(req('/x'), p(event.id))).status).toBe(404);
    expect((await BUNDLE_PREVIEW(req('/x'), p(event.id))).status).toBe(404);
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).enabled).toBe(true);
  });

  it('requires the Genie add-on', async () => {
    const { tenant, client } = await seedTenant({ genieEnabled: false });
    sessionTenantId = tenant.id;
    const event = await seedEvent(tenant.id, client.id);
    expect((await DASH(req('/x'), p(event.id))).status).toBe(403);
    expect((await LIBRARY()).status).toBe(200); // Templates aren't Genie-only
  });

  it('sets up an event with defaults once', async () => {
    const { tenant, client } = await seedTenant();
    sessionTenantId = tenant.id;
    const event = await seedEvent(tenant.id, client.id, { settings: false, templates: 0 });
    expect((await SETUP(json('/x', 'POST', { timeZone: 'Mars/Olympus' }), p(event.id))).status).toBe(400);
    expect((await SETUP(json('/x', 'POST', { timeZone: 'Europe/London' }), p(event.id))).status).toBe(201);
    expect((await SETUP(json('/x', 'POST', { timeZone: 'UTC' }), p(event.id))).status).toBe(200);
    const d = await (await DASH(req('/x'), p(event.id))).json();
    expect(d.settings).toMatchObject({ enabled: true, timeZone: 'Europe/London' });
  });
});

describe('Event Genie dashboard: settings', () => {
  it('saves every section and the bundle still validates', async () => {
    const { tenant, event } = await setup();
    const r = await PATCH(json('/x', 'PATCH', FULL_PATCH), p(event.id));
    expect(r.status).toBe(200);
    const s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(s).toMatchObject({ timeZone: 'America/Chicago', perShotPreviewSeconds: 3, retakesPerShot: 2, defaultFilterId: 'warm', guestLinkScope: 'all', printMaxCopies: 3, printDefaultCopies: 2 });
    expect((s.filters as any[]).map(f => f.id)).toEqual(['original', 'warm', 'bw']);

    const preview = await BUNDLE_PREVIEW(req('/x'), p(event.id));
    expect(preview.status).toBe(200);
    const bundle = await preview.json();
    expect(bundle.filters.filters[1]).toEqual({ id: 'warm', name: 'Warm', steps: [{ type: 'colorPreset', preset: 'warm', intensity: 0.5 }] });
    const validate = await bundleValidator();
    if (validate) expect(validate(bundle)).toBeNull();

    const { token } = await seedDevice(tenant.id);
    const dev = await (await DEVICE_BUNDLE(req(`/api/genie/events/${event.id}/bundle`, { token }), { params: { eventId: event.id } })).json();
    expect(dev.bundleVersion).toBe(bundle.bundleVersion);
  });

  it.each([
    ['shot count over 10', { capture: { ...FULL_PATCH.capture, shotCount: 11 } }],
    ['idle timeout under 10', { capture: { ...FULL_PATCH.capture, idleTimeoutSeconds: 5 } }],
    ['unknown merge field', { sharing: { ...FULL_PATCH.sharing, emailSubject: 'Hi {{lastName}}' } }],
    ['text without a link', { sharing: { ...FULL_PATCH.sharing, smsBody: 'Hi {{firstName}}' } }],
    ['text too long', { sharing: { ...FULL_PATCH.sharing, smsBody: '{{link}} ' + 'x'.repeat(480) } }],
    ['bad link scope', { sharing: { ...FULL_PATCH.sharing, guestLinkScope: 'everyone' } }],
    ['default copies above max', { printing: { enabled: true, maxCopies: 2, defaultCopies: 3 } }],
    ['default filter not offered', { filters: { guestFiltersEnabled: true, defaultFilterId: 'sepia', filterIds: ['original'] } }],
    ['unknown filter', { filters: { guestFiltersEnabled: true, defaultFilterId: 'original', filterIds: ['original', 'neon'] } }],
    ['no filters', { filters: { guestFiltersEnabled: true, defaultFilterId: 'original', filterIds: [] } }],
    ['unknown field', { maxDevices: 5 }],
    ['bad time zone', { timeZone: 'Nowhere/Town' }],
  ])('rejects %s', async (_name, body) => {
    const { event } = await setup();
    const before = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } });
    expect((await PATCH(json('/x', 'PATCH', body), p(event.id))).status).toBe(400);
    const after = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(after.updatedAt).toEqual(before.updatedAt);
  });

  it('locks once the event starts', async () => {
    const { tenant, client } = await seedTenant();
    sessionTenantId = tenant.id;
    const event = await seedEvent(tenant.id, client.id);
    await prisma.event.update({ where: { id: event.id }, data: { eventDate: new Date(Date.now() - 3600_000), startTime: new Date(Date.now() - 600_000), endTime: new Date(Date.now() + 3600_000) } });
    const r = await PATCH(json('/x', 'PATCH', { enabled: false }), p(event.id));
    expect(r.status).toBe(409);
    expect((await r.json()).code).toBe('event_locked');
    const lib = await libraryTemplate(null);
    expect((await ADD_T(json('/x', 'POST', { libraryTemplateId: lib.id }), p(event.id))).status).toBe(409);
    const d = await (await DASH(req('/x'), p(event.id))).json();
    expect(d.lockedAt).toBeTruthy();
    const bundle = await (await BUNDLE_PREVIEW(req('/x'), p(event.id))).json();
    expect(bundle.lockedAt).toBe(new Date(d.lockedAt).toISOString());
  });

  it('turning Genie off hides the event from iPads', async () => {
    const { tenant, event } = await setup();
    const { token } = await seedDevice(tenant.id);
    const list = async () => (await (await DEVICE_EVENTS(req('/api/genie/events', { token }))).json()).events.map((e: any) => e.id);
    expect(await list()).toContain(event.id);
    expect((await PATCH(json('/x', 'PATCH', { enabled: false }), p(event.id))).status).toBe(200);
    expect(await list()).not.toContain(event.id);
    const b = await DEVICE_BUNDLE(req(`/api/genie/events/${event.id}/bundle`, { token }), { params: { eventId: event.id } });
    expect(b.status).toBe(409);
  });

  it('warns about providers that are off or untested', async () => {
    const { tenant, event } = await setup();
    let d = await (await DASH(req('/x'), p(event.id))).json();
    expect(d.providerWarnings.map((w: any) => w.channel)).toEqual(['sms', 'email']); // set up, never tested
    await prisma.genieMessagingConfig.update({ where: { tenantId: tenant.id }, data: { smsTestedAt: new Date(), emailTestedAt: new Date(), emailFromAddress: 'info@boothgen.com' } });
    d = await (await DASH(req('/x'), p(event.id))).json();
    expect(d.providerWarnings).toEqual([{ channel: 'email', message: expect.stringContaining("can't send from boothgen.com") }]);
    expect(d.photosHiddenAt).toBe('2027-01-11T12:00:00.000Z');
  });
});

describe('Event Genie dashboard: templates', () => {
  it('adds Standard and own templates, never another tenant\'s', async () => {
    const { tenant, event } = await setup();
    const standard = await libraryTemplate(null, { alternate: true });
    const draft = await libraryTemplate(null, { published: false });
    const mine = await libraryTemplate(tenant.id);
    const other = await seedTenant();
    const theirs = await libraryTemplate(other.tenant.id);

    const lib = await (await LIBRARY()).json();
    expect(lib.standard.map((t: any) => t.id)).toContain(standard.id);
    expect(lib.standard.map((t: any) => t.id)).not.toContain(draft.id);
    expect(lib.mine.map((t: any) => t.id)).toEqual([mine.id]);

    expect((await ADD_T(json('/x', 'POST', { libraryTemplateId: theirs.id }), p(event.id))).status).toBe(404);
    expect((await ADD_T(json('/x', 'POST', { libraryTemplateId: draft.id }), p(event.id))).status).toBe(404);
    const a = await ADD_T(json('/x', 'POST', { libraryTemplateId: standard.id, alternate: true }), p(event.id));
    expect(a.status).toBe(201);
    expect((await a.json()).alternateLayout).toMatchObject({ orientation: 'landscape' });
    expect((await ADD_T(json('/x', 'POST', { libraryTemplateId: mine.id }), p(event.id))).status).toBe(201);

    const d = await (await DASH(req('/x'), p(event.id))).json();
    expect(d.templates.map((t: any) => t.libraryTemplateId)).toEqual([null, standard.id, mine.id]);
    expect(d.templates[1].alternateAvailable).toBe(true);
    const validate = await bundleValidator();
    if (validate) expect(validate(await (await BUNDLE_PREVIEW(req('/x'), p(event.id))).json())).toBeNull();
  });

  it('reorders only with the exact set of the event\'s templates', async () => {
    const { tenant, client, event } = await setup();
    const lib = await libraryTemplate(null);
    await ADD_T(json('/x', 'POST', { libraryTemplateId: lib.id }), p(event.id));
    const ids = (await prisma.eventGenieTemplate.findMany({ where: { eventId: event.id }, orderBy: { sortOrder: 'asc' } })).map(t => t.id);
    const otherEvent = await seedEvent(tenant.id, client.id);
    const foreign = (await prisma.eventGenieTemplate.findFirstOrThrow({ where: { eventId: otherEvent.id } })).id;

    expect((await ORDER_T(json('/x', 'PUT', { order: [ids[1]] }), p(event.id))).status).toBe(409);
    expect((await ORDER_T(json('/x', 'PUT', { order: [ids[1], foreign] }), p(event.id))).status).toBe(409);
    expect((await ORDER_T(json('/x', 'PUT', { order: [ids[1], ids[1]] }), p(event.id))).status).toBe(409);
    const r = await ORDER_T(json('/x', 'PUT', { order: [ids[1], ids[0]] }), p(event.id));
    expect((await r.json()).map((t: any) => t.id)).toEqual([ids[1], ids[0]]);
    const bundle = await (await BUNDLE_PREVIEW(req('/x'), p(event.id))).json();
    expect(bundle.templates.map((t: any) => t.id)).toEqual([ids[1], ids[0]]);
  });

  it("can't touch a template through another event or tenant", async () => {
    const { tenant, client, event } = await setup();
    const t = await prisma.eventGenieTemplate.findFirstOrThrow({ where: { eventId: event.id } });
    const otherEvent = await seedEvent(tenant.id, client.id);
    const tp = (id: string, templateId: string) => ({ params: { id, templateId } });
    expect((await DEL_T(req('/x', { method: 'DELETE' }), tp(otherEvent.id, t.id))).status).toBe(404);
    sessionTenantId = (await seedTenant()).tenant.id;
    expect((await PATCH_T(json('/x', 'PATCH', { name: 'Hijack' }), tp(event.id, t.id))).status).toBe(404);
    expect((await DEL_T(req('/x', { method: 'DELETE' }), tp(event.id, t.id))).status).toBe(404);
    expect(await prisma.eventGenieTemplate.count({ where: { id: t.id } })).toBe(1);
  });

  it('toggles the alternate orientation from the library', async () => {
    const { event } = await setup();
    const lib = await libraryTemplate(null, { alternate: true });
    const added = await (await ADD_T(json('/x', 'POST', { libraryTemplateId: lib.id }), p(event.id))).json();
    const tp = { params: { id: event.id, templateId: added.id } };
    const on = await (await PATCH_T(json('/x', 'PATCH', { alternate: true }), tp)).json();
    expect(on.alternateLayout.orientation).toBe('landscape');
    expect(on.version).toBe(2);
    const off = await (await PATCH_T(json('/x', 'PATCH', { alternate: false }), tp)).json();
    expect(off.alternateLayout).toBeNull();
    const seeded = await prisma.eventGenieTemplate.findFirstOrThrow({ where: { eventId: event.id, libraryTemplateId: null } });
    expect((await PATCH_T(json('/x', 'PATCH', { alternate: true }), { params: { id: event.id, templateId: seeded.id } })).status).toBe(422);
  });
});

describe('Event Genie dashboard: shares', () => {
  async function share(tenantId: string, eventId: string, status: string) {
    const gallery = await prisma.gallery.upsert({ where: { eventId }, create: { tenantId, eventId, title: 'G' }, update: {} });
    const session = await prisma.genieSession.create({ data: { tenantId, eventId, galleryId: gallery.id, clientId: randomUUID(), publicToken: randomUUID(), startedAt: new Date() } });
    return prisma.genieShare.create({ data: { tenantId, eventId, sessionId: session.id, clientId: randomUUID(), channel: 'sms', destination: '+14155550100', status, error: status === 'failed' ? 'Twilio undelivered (error 30003)' : null, requestedAt: new Date() } });
  }

  it('resends a failed message exactly once', async () => {
    const { tenant, event } = await setup();
    const s = await share(tenant.id, event.id, 'failed');
    const list = await (await SHARES(req('/x'), p(event.id))).json();
    expect(list.shares[0]).toMatchObject({ id: s.id, status: 'failed', error: 'Twilio undelivered (error 30003)' });

    const sp = { params: { id: event.id, shareId: s.id } };
    const [a, b] = await Promise.all([RESEND(req('/x', { method: 'POST' }), sp), RESEND(req('/x', { method: 'POST' }), sp)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(inngestSend).toHaveBeenCalledTimes(1);
    expect(inngestSend.mock.calls[0][0]).toMatchObject({ id: `genie-share-${s.id}-2`, name: 'genie/share.send', data: { shareId: s.id } });
    expect(await prisma.genieShare.findUniqueOrThrow({ where: { id: s.id } })).toMatchObject({ status: 'queued', error: null, attempts: 2 });
  });

  it('never resends a sent or delivered message, or another tenant\'s', async () => {
    const { tenant, event } = await setup();
    for (const status of ['queued', 'sent', 'delivered']) {
      const s = await share(tenant.id, event.id, status);
      expect((await RESEND(req('/x', { method: 'POST' }), { params: { id: event.id, shareId: s.id } })).status).toBe(409);
    }
    const failed = await share(tenant.id, event.id, 'failed');
    sessionTenantId = (await seedTenant()).tenant.id;
    expect((await RESEND(req('/x', { method: 'POST' }), { params: { id: event.id, shareId: failed.id } })).status).toBe(404);
    expect(inngestSend).not.toHaveBeenCalled();
  });
});
