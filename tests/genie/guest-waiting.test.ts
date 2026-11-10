import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';

vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));

import { prisma } from '@/lib/prisma/client';
import { BOOTH_OFFLINE_AFTER_MS, isBoothOffline, morePhotosPending, pollDelayMs } from '@/lib/genie/guestWaiting';
import { GET as getSession } from '@/app/api/g/[token]/s/[sessionToken]/route';
import { GET as getGallery } from '@/app/api/g/[token]/route';
import { guestSession, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const MIN = 60_000;

describe('poll schedule', () => {
  it('checks every 5 s for 2 minutes, every 15 s until 10 minutes, then every minute', () => {
    expect(pollDelayMs(0)).toBe(5_000);
    expect(pollDelayMs(2 * MIN - 1)).toBe(5_000);
    expect(pollDelayMs(2 * MIN)).toBe(15_000);
    expect(pollDelayMs(10 * MIN - 1)).toBe(15_000);
    expect(pollDelayMs(10 * MIN)).toBe(60_000);
    expect(pollDelayMs(5 * 60 * MIN)).toBe(60_000);
  });
});

describe('booth offline rule', () => {
  const now = new Date('2026-12-12T23:50:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  it('is offline only with no photos and an iPad silent for over 2 minutes', () => {
    expect(isBoothOffline({ photoCount: 0, lastSeenAt: ago(BOOTH_OFFLINE_AFTER_MS + 1000), now })).toBe(true);
    expect(isBoothOffline({ photoCount: 0, lastSeenAt: null, now })).toBe(true);
    expect(isBoothOffline({ photoCount: 0, lastSeenAt: ago(90_000), now })).toBe(false);
    expect(isBoothOffline({ photoCount: 1, lastSeenAt: ago(60 * MIN), now })).toBe(false); // photos already here
    expect(isBoothOffline({ photoCount: 0, lastSeenAt: undefined, now })).toBe(false); // no iPad known
  });

  it('expects more photos until every shot is in, and stops waiting after 30 quiet minutes', () => {
    const base = { expectedShots: 3, now };
    expect(morePhotosPending({ ...base, hasGallery: true, shots: 0, lastPhotoAt: ago(MIN) })).toBe(true);
    expect(morePhotosPending({ ...base, hasGallery: true, shots: 3, lastPhotoAt: ago(MIN) })).toBe(false);
    expect(morePhotosPending({ ...base, hasGallery: false, shots: 3, lastPhotoAt: ago(MIN) })).toBe(true);
    expect(morePhotosPending({ ...base, hasGallery: true, shots: 1, lastPhotoAt: ago(31 * MIN) })).toBe(false);
    expect(morePhotosPending({ ...base, hasGallery: false, shots: 0, lastPhotoAt: null })).toBe(false);
  });
});

describe('guest page APIs', () => {
  beforeEach(resetDb);
  afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

  async function setup(scope: 'own' | 'all' = 'own') {
    const { tenant, client } = await seedTenant();
    const event = await seedEvent(tenant.id, client.id);
    await prisma.event.update({ where: { id: event.id }, data: { endTime: new Date(Date.now() + 3600_000) } });
    await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { guestLinkScope: scope, shotCount: 2 } });
    const gallery = await prisma.gallery.create({ data: { tenantId: tenant.id, eventId: event.id, title: 'G' } });
    const { device } = await seedDevice(tenant.id);
    await prisma.genieEventDevice.create({ data: { tenantId: tenant.id, eventId: event.id, deviceId: device.id } });
    const lastSeen = (ms: number) => prisma.genieDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date(Date.now() - ms) } });
    return { tenant, event, gallery, device, lastSeen };
  }
  const sessionReq = (token: string, st: string) => getSession(new NextRequest(`https://boothgen.test/api/g/${token}/s/${st}`), { params: { token, sessionToken: st } });
  const photo = (galleryId: string, sessionId: string, genieKind: string) => prisma.galleryAsset.create({
    data: { galleryId, genieSessionId: sessionId, clientId: randomUUID(), genieKind, assetType: 'PHOTO', url: 'https://media.boothgen.test/' + randomUUID() + '.jpg', filename: 'x.jpg', fileSizeBytes: 1, mimeType: 'image/jpeg', approvalStatus: 'APPROVED' },
  });

  it('a link scanned before upload: offline only when the event\'s iPads have gone quiet', async () => {
    const { gallery, lastSeen } = await setup();
    const token = guestSession().publicToken;
    await lastSeen(30_000);
    expect(await (await sessionReq(gallery.clientToken, token)).json()).toMatchObject({ pending: true, boothOffline: false });
    await lastSeen(5 * MIN);
    expect((await (await sessionReq(gallery.clientToken, token)).json()).boothOffline).toBe(true);
  });

  it('a known session: uses its own iPad, then shows the gallery copy with more on the way', async () => {
    const { tenant, event, gallery, device, lastSeen } = await setup();
    const s = guestSession();
    const session = await prisma.genieSession.create({ data: { tenantId: tenant.id, eventId: event.id, galleryId: gallery.id, deviceId: device.id, clientId: s.id, publicToken: s.publicToken, startedAt: new Date() } });
    await lastSeen(10 * MIN);
    let d = await (await sessionReq(gallery.clientToken, s.publicToken)).json();
    expect(d).toMatchObject({ boothOffline: true, morePending: false, assets: [] });

    await photo(gallery.id, session.id, 'gallery');
    d = await (await sessionReq(gallery.clientToken, s.publicToken)).json();
    expect(d).toMatchObject({ boothOffline: false, morePending: true });
    await photo(gallery.id, session.id, 'shot');
    await photo(gallery.id, session.id, 'shot');
    d = await (await sessionReq(gallery.clientToken, s.publicToken)).json();
    expect(d.morePending).toBe(false);
    expect(d.assets).toHaveLength(3);
  });

  it('the live gallery says the booth is offline only while it is empty', async () => {
    const { tenant, event, gallery, lastSeen } = await setup('all');
    await lastSeen(5 * MIN);
    const live = async () => (await (await getGallery(new NextRequest(`https://boothgen.test/api/g/${gallery.clientToken}`), { params: { token: gallery.clientToken } })).json()).gallery;
    expect(await live()).toMatchObject({ isLive: true, boothOffline: true });
    const s = guestSession();
    const session = await prisma.genieSession.create({ data: { tenantId: tenant.id, eventId: event.id, galleryId: gallery.id, clientId: s.id, publicToken: s.publicToken, startedAt: new Date() } });
    await photo(gallery.id, session.id, 'gallery');
    expect((await live()).boothOffline).toBe(false);
  });
});
