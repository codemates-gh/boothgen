import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

vi.mock('@/lib/storage/r2', () => ({ deleteFromR2: vi.fn(async () => {}), r2KeyFromUrl: (u: string) => u.replace('https://media.boothgen.test/', ''), headR2Object: vi.fn(), getPresignedUploadUrl: vi.fn(), r2PublicUrl: (k: string) => 'https://media.boothgen.test/' + k }));

import { prisma } from '@/lib/prisma/client';
import { deleteFromR2 } from '@/lib/storage/r2';
import { expireGalleries, deleteExpiredGalleries } from '@/lib/inngest/functions';
import { buildEventBundle } from '@/lib/genie/bundle';
import { renderMergeFields, prepareShare } from '@/lib/genie/shares';
import { resetDb, seedEvent, seedTenant } from './helpers';

const DAY = 24 * 3600 * 1000;
// Runs a cron function's handler directly (the handlers take no event input)
const run = (fn: unknown) => (fn as { fn: (ctx: unknown) => Promise<any> }).fn({});

async function galleryFor(daysAgo: number, opts: { published?: boolean; genie?: boolean } = {}) {
  const { tenant, client } = await seedTenant();
  const event = await seedEvent(tenant.id, client.id);
  await prisma.event.update({ where: { id: event.id }, data: { eventDate: new Date(Date.now() - daysAgo * DAY) } });
  const gallery = await prisma.gallery.create({ data: { tenantId: tenant.id, eventId: event.id, title: 'G', isPublished: opts.published ?? false } });
  if (opts.genie) {
    const session = await prisma.genieSession.create({ data: { clientId: randomUUID(), tenantId: tenant.id, eventId: event.id, galleryId: gallery.id, publicToken: randomUUID().replace(/-/g, ''), startedAt: new Date() } });
    await prisma.galleryAsset.create({ data: { galleryId: gallery.id, genieSessionId: session.id, genieKind: 'gallery', assetType: 'PHOTO', url: `https://media.boothgen.test/galleries/${gallery.id}/genie-1.jpg`, filename: 'genie-1.jpg', mimeType: 'image/jpeg', fileSizeBytes: 1000 } });
  }
  return { tenant, event, gallery };
}

async function setRetention(expire: string | null, del: string | null) {
  for (const [key, value] of [['gallery_expire_days', expire], ['gallery_delete_days', del]] as const) {
    if (value === null) await prisma.systemSetting.deleteMany({ where: { key } });
    else await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
}

beforeEach(async () => { vi.clearAllMocks(); await setRetention(null, null); await resetDb(); });
afterAll(async () => { await setRetention(null, null); await resetDb(); await prisma.$disconnect(); });

describe('Gallery expiry for Genie photos', () => {
  it('expires an unpublished gallery with Genie sessions, then deletes it and its photos', async () => {
    const { gallery } = await galleryFor(31, { genie: true });
    await run(expireGalleries);
    expect(await prisma.gallery.findUniqueOrThrow({ where: { id: gallery.id } })).toMatchObject({ isExpired: true, isPublished: false });

    await run(deleteExpiredGalleries); // still inside the delete window
    expect(await prisma.gallery.findUnique({ where: { id: gallery.id } })).not.toBeNull();

    await prisma.event.update({ where: { id: gallery.eventId }, data: { eventDate: new Date(Date.now() - 61 * DAY) } });
    await run(deleteExpiredGalleries);
    expect(await prisma.gallery.findUnique({ where: { id: gallery.id } })).toBeNull();
    expect(await prisma.genieSession.count({ where: { galleryId: gallery.id } })).toBe(0);
    expect(deleteFromR2).toHaveBeenCalledWith(`galleries/${gallery.id}/genie-1.jpg`);
  });

  it('leaves unpublished galleries without Genie sessions alone, as before', async () => {
    const plain = await galleryFor(90);
    const published = await galleryFor(31, { published: true });
    const recentGenie = await galleryFor(5, { genie: true });
    await run(expireGalleries);
    await run(deleteExpiredGalleries);
    expect(await prisma.gallery.findUniqueOrThrow({ where: { id: plain.gallery.id } })).toMatchObject({ isExpired: false, isPublished: false });
    expect(await prisma.gallery.findUniqueOrThrow({ where: { id: published.gallery.id } })).toMatchObject({ isExpired: true, isPublished: false });
    expect(await prisma.gallery.findUniqueOrThrow({ where: { id: recentGenie.gallery.id } })).toMatchObject({ isExpired: false });
  });
});

describe('Bundle photo dates', () => {
  it('follow the platform expiry settings and only bump bundleVersion when they change', async () => {
    const { tenant, client } = await seedTenant();
    const event = await seedEvent(tenant.id, client.id); // 2026-12-12T12:00Z
    const b1 = await buildEventBundle(tenant.id, event.id);
    const b2 = await buildEventBundle(tenant.id, event.id);
    if (!b1.ok || !b2.ok) throw new Error('bundle failed');
    expect((b1.bundle as any).sharing).toMatchObject({ photosHiddenAt: '2027-01-11T12:00:00.000Z', photosDeletedAt: '2027-02-10T12:00:00.000Z' });
    expect(b2.bundleVersion).toBe(b1.bundleVersion);

    await setRetention('14', '7');
    const b3 = await buildEventBundle(tenant.id, event.id);
    if (!b3.ok) throw new Error('bundle failed');
    expect((b3.bundle as any).sharing).toMatchObject({ photosHiddenAt: '2026-12-26T12:00:00.000Z', photosDeletedAt: '2027-01-02T12:00:00.000Z' });
    expect(b3.bundleVersion).toBe(b1.bundleVersion + 1);
  });
});

describe('{{expiresOn}} merge field', () => {
  it('renders the last day photos are available, in the event time zone', async () => {
    expect(renderMergeFields('Available until {{expiresOn}}.', { eventName: 'E', link: 'L', expiresOn: 'Jan 11' })).toBe('Available until Jan 11.');
    const { tenant, client } = await seedTenant();
    const event = await seedEvent(tenant.id, client.id);
    await prisma.event.update({ where: { id: event.id }, data: { eventDate: new Date('2026-12-12T00:00:00Z') } }); // BoothGen stores dates at UTC midnight
    await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { smsBody: 'Photos: {{link}} (until {{expiresOn}})', timeZone: 'UTC' } });
    const gallery = await prisma.gallery.create({ data: { tenantId: tenant.id, eventId: event.id, title: 'G' } });
    const session = await prisma.genieSession.create({ data: { clientId: randomUUID(), tenantId: tenant.id, eventId: event.id, galleryId: gallery.id, publicToken: randomUUID().replace(/-/g, ''), startedAt: new Date() } });
    await prisma.galleryAsset.create({ data: { galleryId: gallery.id, genieSessionId: session.id, genieKind: 'gallery', assetType: 'PHOTO', url: 'https://media.boothgen.test/x.jpg', filename: 'x.jpg', mimeType: 'image/jpeg', fileSizeBytes: 1 } });
    const share = await prisma.genieShare.create({ data: { clientId: randomUUID(), tenantId: tenant.id, eventId: event.id, sessionId: session.id, channel: 'sms', destination: '+14155550100', smsConsentAt: new Date(), requestedAt: new Date(), status: 'queued' } });
    const p = await prepareShare(share.id);
    expect(p.ready && p.text).toMatch(/\(until Jan 10\)$/); // hidden from Jan 11, so the last full day is Jan 10
  });
});
