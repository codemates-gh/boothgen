import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

let tenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));

import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { PUT as PUT_DEFAULTS } from '@/app/api/genie-defaults/route';
import { GET as deviceBundle } from '@/app/api/genie/events/[eventId]/bundle/route';
import { bundleValidator, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

afterAll(resetDb);
beforeEach(resetDb);

describe('photo live view settings', () => {
  it('mirrored and no design by default, always in the bundle; changing one bumps the version', async () => {
    const { tenant, client } = await seedTenant();
    tenantId = tenant.id;
    const event = await seedEvent(tenant.id, client.id);
    const { token } = await seedDevice(tenant.id);
    const bundleOf = async () => (await deviceBundle(req('/x', { token }), { params: { eventId: event.id } })).json();

    const d = await (await DASH(req('/x'), { params: { id: event.id } })).json();
    expect(d.settings.liveView).toEqual({ mirrorLiveView: true, showDesignWhilePosing: false });
    const before = await bundleOf();
    expect(before.capture).toMatchObject({ mirrorLiveView: true, showDesignWhilePosing: false });
    const validate = await bundleValidator();
    if (validate) expect(validate(before)).toBeNull();

    const r = await PATCH(req('/x', { method: 'PATCH', body: { liveView: { mirrorLiveView: false, showDesignWhilePosing: true } } }), { params: { id: event.id } });
    expect((await r.json()).liveView).toEqual({ mirrorLiveView: false, showDesignWhilePosing: true });
    const after = await bundleOf();
    expect(after.capture).toMatchObject({ mirrorLiveView: false, showDesignWhilePosing: true });
    expect(after.bundleVersion).toBe(before.bundleVersion + 1);
    if (validate) expect(validate(after)).toBeNull();
  });

  it('thank-you screen: absent while default, sent when changed, and follows the account default', async () => {
    const { tenant, client } = await seedTenant();
    tenantId = tenant.id;
    const event = await seedEvent(tenant.id, client.id);
    const { token } = await seedDevice(tenant.id);
    const bundleOf = async () => (await deviceBundle(req('/x', { token }), { params: { eventId: event.id } })).json();
    const validate = await bundleValidator();

    const d = await (await DASH(req('/x'), { params: { id: event.id } })).json();
    expect(d.settings.capture).toMatchObject({ thankYouSeconds: 5, thankYouTitle: 'Thank you!', thankYouSubtitle: 'Your photos are on their way.' });
    expect((await bundleOf()).capture.thankYou).toBeUndefined();

    const bad = await PATCH(req('/x', { method: 'PATCH', body: { capture: { ...d.settings.capture, thankYouTitle: '' } } }), { params: { id: event.id } });
    expect(bad.status).toBe(400);
    await PATCH(req('/x', { method: 'PATCH', body: { capture: { ...d.settings.capture, thankYouSeconds: 8, thankYouTitle: 'Cheers!', thankYouSubtitle: '' } } }), { params: { id: event.id } });
    const b = await bundleOf();
    expect(b.capture.thankYou).toEqual({ seconds: 8, title: 'Cheers!', subtitle: '' });
    if (validate) expect(validate(b)).toBeNull();

    // An event following the defaults picks up the account's thank-you screen
    const other = await seedEvent(tenant.id, client.id);
    const { prisma } = await import('@/lib/prisma/client');
    await prisma.eventGenieSettings.update({ where: { eventId: other.id }, data: { customCapture: false } });
    const r = await PUT_DEFAULTS(req('/x', { method: 'PUT', body: { capture: { ...d.settings.capture, thankYouSeconds: 12, thankYouTitle: 'Thanks for coming', thankYouSubtitle: 'See you soon' } } }));
    expect(r.status).toBe(200);
    const s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: other.id } });
    expect([s.thankYouSeconds, s.thankYouTitle, s.thankYouSubtitle]).toEqual([12, 'Thanks for coming', 'See you soon']);
  });

  it('Beautify (Glamour) is offered as a filter and valid in the bundle', async () => {
    const { tenant, client } = await seedTenant();
    tenantId = tenant.id;
    const event = await seedEvent(tenant.id, client.id);
    const { token } = await seedDevice(tenant.id);
    const d = await (await DASH(req('/x'), { params: { id: event.id } })).json();
    expect(d.settings.filters.available.map((f: any) => f.id)).toContain('glamour');
    const r = await PATCH(req('/x', { method: 'PATCH', body: { filters: { guestFiltersEnabled: true, defaultFilterId: 'original', filterIds: ['original', 'glamour'] } } }), { params: { id: event.id } });
    expect(r.status).toBe(200);
    const b = await (await deviceBundle(req('/x', { token }), { params: { eventId: event.id } })).json();
    expect(b.filters.filters.find((f: any) => f.id === 'glamour')).toEqual({ id: 'glamour', name: 'Beautify (Glamour)', steps: [{ type: 'beautify', intensity: 0.7 }] });
    const validate = await bundleValidator();
    if (validate) expect(validate(b)).toBeNull();
  });
});
