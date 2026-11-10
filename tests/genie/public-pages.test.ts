import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';

vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));

import { prisma } from '@/lib/prisma/client';
import { GET as getSession } from '@/app/api/g/[token]/s/[sessionToken]/route';
import { GET as getGallery } from '@/app/api/g/[token]/route';
import { guestSession, resetDb, seedEvent, seedTenant } from './helpers';

beforeEach(resetDb);
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

async function seedGallery(opts: { scope?: 'own' | 'all'; published?: boolean; accessCode?: string; endTime?: Date } = {}) {
  const { tenant, client } = await seedTenant();
  const event = await seedEvent(tenant.id, client.id);
  await prisma.event.update({ where: { id: event.id }, data: { endTime: opts.endTime ?? new Date(Date.now() + 3600000) } });
  await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { guestLinkScope: opts.scope ?? 'own' } });
  const gallery = await prisma.gallery.create({
    data: { tenantId: tenant.id, eventId: event.id, title: 'G', isPublished: opts.published ?? false, accessCode: opts.accessCode ?? null },
  });
  const photo = (sessionId: string | null, sortOrder: number, genieKind: string | null = null) => prisma.galleryAsset.create({
    data: {
      galleryId: gallery.id, genieSessionId: sessionId, clientId: sessionId ? randomUUID() : null, genieKind, assetType: 'PHOTO',
      url: 'https://media.boothgen.test/' + randomUUID() + '.jpg', filename: 'x.jpg', fileSizeBytes: 1, mimeType: 'image/jpeg', sortOrder, approvalStatus: 'APPROVED',
    },
  });
  const newSession = async () => {
    const s = guestSession();
    return prisma.genieSession.create({ data: { tenantId: tenant.id, eventId: event.id, galleryId: gallery.id, clientId: s.id, publicToken: s.publicToken, startedAt: new Date() } });
  };
  const mine = await newSession();
  const other = await newSession();
  const mySheet = await photo(mine.id, 1000, 'print');
  const myShot = await photo(mine.id, 2, 'shot');
  const myPrint = await photo(mine.id, 0, 'gallery');
  const otherPhoto = await photo(other.id, 0, 'gallery');
  const manual = await photo(null, 0);
  return { gallery, mine, other, mySheet, myShot, myPrint, otherPhoto, manual };
}

const sessionReq = (token: string, st: string) => getSession(new NextRequest(`https://boothgen.test/api/g/${token}/s/${st}`), { params: { token, sessionToken: st } });
const galleryReq = (token: string, code?: string) => getGallery(new NextRequest(`https://boothgen.test/api/g/${token}${code ? '?code=' + code : ''}`), { params: { token } });

describe('guest session page', () => {
  it('shows only that session’s photos, gallery image first, while the gallery is unpublished', async () => {
    const g = await seedGallery();
    const res = await sessionReq(g.gallery.clientToken, g.mine.publicToken);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.assets.map((a: any) => a.id)).toEqual([g.myPrint.id, g.myShot.id]);
    expect(json.assets[0].isGallery).toBe(true);
    // The printer sheet is a download, not a duplicate photo
    expect(json.printSheetUrl).toBe(g.mySheet.url);
    expect(JSON.stringify(json)).not.toContain(g.otherPhoto.url);
    expect(JSON.stringify(json)).not.toContain(g.manual.url);
  });

  it('answers "pending" for a well-formed token the booth hasn’t uploaded yet', async () => {
    const g = await seedGallery();
    const res = await sessionReq(g.gallery.clientToken, 'NotUploadedYetToken000001');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pending: true, assets: [] });
    expect((await sessionReq('no-such-gallery', 'NotUploadedYetToken000001')).status).toBe(404);
    expect((await sessionReq(g.gallery.clientToken, 'bad token!')).status).toBe(404);
  });

  it('404s when the session token belongs to a different gallery', async () => {
    const a = await seedGallery();
    const b = await seedGallery();
    expect((await sessionReq(a.gallery.clientToken, b.mine.publicToken)).status).toBe(404);
    expect((await sessionReq(a.gallery.clientToken, 'nope')).status).toBe(404); // malformed
  });

  it('returns no photos once the gallery has expired', async () => {
    const g = await seedGallery();
    await prisma.gallery.update({ where: { id: g.gallery.id }, data: { isExpired: true } });
    const json = await (await sessionReq(g.gallery.clientToken, g.mine.publicToken)).json();
    expect(json).toMatchObject({ isExpired: true, assets: [] });
  });
});

describe('live event gallery (guestLinkScope all)', () => {
  it('stays hidden before publishing when scope is own (unchanged behaviour)', async () => {
    const g = await seedGallery({ scope: 'own' });
    const json = await (await galleryReq(g.gallery.clientToken)).json();
    expect(json.gallery).toMatchObject({ isPublished: false, isLive: false });
    expect(json.assets).toEqual([]);
  });

  it('shows every Genie photo live, but not manual uploads, while unpublished', async () => {
    const g = await seedGallery({ scope: 'all' });
    const json = await (await galleryReq(g.gallery.clientToken)).json();
    expect(json.gallery.isLive).toBe(true);
    // Per guest session: gallery image, then shots; printer sheets and manual uploads left out
    expect(json.assets.map((a: any) => a.id)).toEqual([g.myPrint.id, g.myShot.id, g.otherPhoto.id]);
  });

  it('still requires the access code', async () => {
    const g = await seedGallery({ scope: 'all', accessCode: 'RIVERA' });
    expect((await (await galleryReq(g.gallery.clientToken)).json()).assets).toEqual([]);
    expect((await (await galleryReq(g.gallery.clientToken, 'WRONG')).json()).assets).toEqual([]);
    expect((await (await galleryReq(g.gallery.clientToken, 'RIVERA')).json()).assets).toHaveLength(3);
  });

  it('ends 24 h after the event and returns to the publish flow', async () => {
    const g = await seedGallery({ scope: 'all', endTime: new Date(Date.now() - 25 * 3600000) });
    const json = await (await galleryReq(g.gallery.clientToken)).json();
    expect(json.gallery.isLive).toBe(false);
    expect(json.assets).toEqual([]);
  });

  it('shows all approved photos once published, except Genie printer sheets', async () => {
    const g = await seedGallery({ scope: 'all', published: true });
    const json = await (await galleryReq(g.gallery.clientToken)).json();
    expect(json.gallery.isLive).toBe(false);
    expect(json.assets.map((a: any) => a.id)).not.toContain(g.mySheet.id);
    expect(json.assets).toHaveLength(4);
  });
});
