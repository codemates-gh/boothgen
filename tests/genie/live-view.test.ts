import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

let tenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));

import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
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
});
