import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// 2.119.0: Gallery defaults (upload every Sharing station photo; publish the gallery when the event ends), on for
// Genius accounts, and the job that publishes galleries when events end

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));
const emails: any[] = [];
vi.mock('@/lib/email/send', async orig => ({ ...(await orig<typeof import('@/lib/email/send')>()), sendGalleryPublishedEmail: vi.fn(async (a: any) => { emails.push(a); }) }));
const automations: any[] = [];
vi.mock('@/lib/inngest/trigger', async orig => ({ ...(await orig<typeof import('@/lib/inngest/trigger')>()), triggerAutomation: vi.fn(async (a: any) => { automations.push(a); }) }));

import { prisma } from '@/lib/prisma/client';
import { GET as GET_DEFAULTS, PUT as PUT_DEFAULTS } from '@/app/api/genie-defaults/route';
import { GET as DASH, POST as SETUP, PATCH } from '@/app/api/events/[id]/genie/route';
import { buildEventBundle } from '@/lib/genie/bundle';
import { ensureGallery } from '@/lib/genie/bundle';
import { autoPublishEndedGalleries } from '@/lib/genie/autoPublish';
import { boothEventsClient } from '@/lib/genie/boothEvents';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const json = (body: unknown, method = 'PUT') => req('/x', { method, body });
const p = (id: string) => ({ params: { id } });

async function setup(product: 'crm' | 'genie' = 'crm') {
  const t = await seedTenant({ pro: product === 'crm' });
  await prisma.tenant.update({ where: { id: t.tenant.id }, data: { product } });
  sessionTenantId = t.tenant.id;
  return t;
}
// A Genie event that ended at `end` (its gallery has one photo unless photos: false)
async function endedEvent(tenantId: string, clientId: string, end: Date, opts: { autoPublish?: boolean; photos?: boolean } = {}) {
  const e = await seedEvent(tenantId, clientId);
  await prisma.event.update({ where: { id: e.id }, data: { eventDate: new Date(end.getTime() - 6 * 3600_000), startTime: new Date(end.getTime() - 4 * 3600_000), endTime: end } });
  await prisma.eventGenieSettings.update({ where: { eventId: e.id }, data: { galleryAutoPublish: opts.autoPublish ?? true } });
  const g = await ensureGallery({ id: e.id, tenantId, title: 'Rivera Wedding' });
  if (opts.photos !== false) await prisma.galleryAsset.create({ data: { galleryId: g.id, url: 'https://media.boothgen.test/x.jpg', filename: 'x.jpg', fileSizeBytes: 1, mimeType: 'image/jpeg', assetType: 'PHOTO', approvalStatus: 'APPROVED' } });
  return { event: e, gallery: g };
}

beforeEach(async () => { await resetDb(); emails.length = 0; automations.length = 0; });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Gallery defaults', () => {
  it('Genius accounts start with both on; Genie-only accounts with both off; new events follow them', async () => {
    const { tenant, client } = await setup('crm');
    expect((await (await GET_DEFAULTS()).json()).gallery).toEqual({ uploadAll: true, autoPublish: true });
    const e = await seedEvent(tenant.id, client.id, { settings: false, templates: 0 });
    await SETUP(json({}, 'POST'), p(e.id));
    const d = await (await DASH(req('/x'), p(e.id))).json();
    expect(d.settings.gallery).toMatchObject({ uploadAll: true, autoPublish: true, autoPublishedAt: null });
    expect(d.settings.custom.gallery).toBe(false);

    const g = await setup('genie');
    expect((await (await GET_DEFAULTS()).json()).gallery).toEqual({ uploadAll: false, autoPublish: false });
    const e2 = await seedEvent(g.tenant.id, (await boothEventsClient(g.tenant.id)).id, { settings: false, templates: 0 });
    await SETUP(json({}, 'POST'), p(e2.id));
    expect(await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: e2.id } })).toMatchObject({ sharingUploadAll: false, galleryAutoPublish: false });
  });

  it('per event: changing it makes the section custom, the bundle follows, and reset goes back to the defaults', async () => {
    const { tenant, client } = await setup('crm');
    const e = await seedEvent(tenant.id, client.id, { settings: false });
    await SETUP(json({}, 'POST'), p(e.id));
    expect((await PATCH(json({ gallery: { uploadAll: false, autoPublish: false } }, 'PATCH'), p(e.id))).status).toBe(200);
    let s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: e.id } });
    expect([s.sharingUploadAll, s.galleryAutoPublish, s.customGallery]).toEqual([false, false, true]);
    const b = await buildEventBundle(tenant.id, e.id);
    expect(b.ok && b.bundle.sharingStation).toEqual({ enabled: true });

    // Changing the defaults doesn't touch an event that changed it
    await PUT_DEFAULTS(json({ gallery: { uploadAll: true, autoPublish: false } }));
    s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: e.id } });
    expect(s.sharingUploadAll).toBe(false);

    await PATCH(json({ reset: ['gallery'] }, 'PATCH'), p(e.id));
    s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: e.id } });
    expect([s.sharingUploadAll, s.galleryAutoPublish, s.customGallery]).toEqual([true, false, false]);
    expect((await PATCH(json({ sharingStation: { recentMinutes: null, blurGrid: false, uploadAll: true } }, 'PATCH'), p(e.id))).status).toBe(400);
  });
});

describe('publishing the gallery when the event ends', () => {
  it('publishes once, after the end, only with photos, and the client gets the usual email and automation', async () => {
    const { tenant, client } = await setup('crm');
    const now = new Date();
    const ended = await endedEvent(tenant.id, client.id, new Date(now.getTime() - 30 * 60_000));
    const running = await endedEvent(tenant.id, client.id, new Date(now.getTime() + 60 * 60_000));
    const empty = await endedEvent(tenant.id, client.id, new Date(now.getTime() - 30 * 60_000), { photos: false });
    const off = await endedEvent(tenant.id, client.id, new Date(now.getTime() - 30 * 60_000), { autoPublish: false });

    expect(await autoPublishEndedGalleries(now)).toEqual({ published: 1 });
    const published = (id: string) => prisma.gallery.findUniqueOrThrow({ where: { id } }).then(g => g.isPublished);
    expect([await published(ended.gallery.id), await published(running.gallery.id), await published(empty.gallery.id), await published(off.gallery.id)]).toEqual([true, false, false, false]);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: client.email, portalUrl: expect.stringContaining('/portal/') });
    expect(automations).toEqual([expect.objectContaining({ eventId: ended.event.id, trigger: 'GALLERY_PUBLISHED' })]);
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: ended.event.id } })).galleryAutoPublishedAt).not.toBeNull();

    // The operator unpublishes it: it stays unpublished; the empty one publishes once it has a photo
    await prisma.gallery.update({ where: { id: ended.gallery.id }, data: { isPublished: false } });
    await prisma.galleryAsset.create({ data: { galleryId: empty.gallery.id, url: 'https://media.boothgen.test/y.jpg', filename: 'y.jpg', fileSizeBytes: 1, mimeType: 'image/jpeg', assetType: 'PHOTO', approvalStatus: 'APPROVED' } });
    expect(await autoPublishEndedGalleries(now)).toEqual({ published: 1 });
    expect([await published(ended.gallery.id), await published(empty.gallery.id)]).toEqual([false, true]);
  });

  it('Genie-only booth events publish without emailing the placeholder client', async () => {
    const { tenant } = await setup('genie');
    const booth = await boothEventsClient(tenant.id);
    await endedEvent(tenant.id, booth.id, new Date(Date.now() - 30 * 60_000));
    expect(await autoPublishEndedGalleries()).toEqual({ published: 1 });
    expect(emails).toHaveLength(0);
  });
});
