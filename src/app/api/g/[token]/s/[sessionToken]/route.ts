export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { isBoothOffline, morePhotosPending } from '@/lib/genie/guestWaiting';
import { eventBoothLastSeen } from '@/lib/genie/boothStatus';

// One guest's Genie session: only that session's photos, independent of the gallery's publish state
const SESSION_TOKEN = /^[A-Za-z0-9_-]{22,}$/;

export async function GET(_req: NextRequest, { params }: { params: { token: string; sessionToken: string } }) {
  const session = await prisma.genieSession.findUnique({
    where: { publicToken: params.sessionToken },
    include: {
      device: { select: { lastSeenAt: true, revokedAt: true } },
      gallery: {
        select: {
          clientToken: true, isExpired: true,
          event: { select: { title: true, eventDate: true, genieSettings: { select: { shotCount: true } } } },
          tenant: { select: { branding: { select: { companyName: true, logoUrl: true, primaryColor: true } } } },
        },
      },
      assets: {
        where: { approvalStatus: 'APPROVED' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, url: true, width: true, height: true, genieKind: true, thumbnailUrl: true, createdAt: true },
      },
    },
  });
  // Genie builds the link offline, so a guest can scan it before the booth has uploaded: for a real gallery and a
  // well-formed token we haven't seen yet, answer "pending" instead of not found
  if (!session) {
    if (!SESSION_TOKEN.test(params.sessionToken)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const gallery = await prisma.gallery.findUnique({
      where: { clientToken: params.token },
      select: {
        isExpired: true, eventId: true,
        event: { select: { title: true, eventDate: true } },
        tenant: { select: { branding: { select: { companyName: true, logoUrl: true, primaryColor: true } } } },
      },
    });
    if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({
      event: gallery.event, branding: gallery.tenant.branding, isExpired: gallery.isExpired,
      pending: true, assets: [], printSheetUrl: null, morePending: false,
      boothOffline: !gallery.isExpired && isBoothOffline({ photoCount: 0, lastSeenAt: await eventBoothLastSeen(gallery.eventId) }),
    });
  }
  // The session must belong to the gallery in the link
  if (session.gallery.clientToken !== params.token) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const expired = session.gallery.isExpired;
  // The printer sheet is a download only; a boomerang's poster is the clip's thumbnail
  const photos = expired ? [] : session.assets.filter(a => a.genieKind !== 'print' && a.genieKind !== 'boomerangPoster');
  const boomerang = photos.find(a => a.genieKind === 'boomerang');
  const lastSeen = session.device && !session.device.revokedAt ? session.device.lastSeenAt : session.device ? null : await eventBoothLastSeen(session.eventId);
  return NextResponse.json({
    event: { title: session.gallery.event.title, eventDate: session.gallery.event.eventDate },
    branding: session.gallery.tenant.branding,
    isExpired: expired,
    galleryUrl: '/g/' + session.gallery.clientToken,
    // Boomerang clip or gallery image first, then shots; the printer sheet is offered as a download only
    assets: photos.map(a => ({
      id: a.id, url: a.url, width: a.width, height: a.height, isGallery: a.genieKind === 'gallery',
      ...(a.genieKind === 'boomerang' ? { isBoomerang: true, posterUrl: a.thumbnailUrl } : {}),
    })),
    printSheetUrl: expired ? null : session.assets.find(a => a.genieKind === 'print')?.url ?? null,
    // A boomerang session uploads only the clip (and its poster)
    morePending: !expired && !boomerang && morePhotosPending({
      hasGallery: photos.some(a => a.genieKind === 'gallery'),
      shots: photos.filter(a => a.genieKind === 'shot').length,
      expectedShots: session.gallery.event.genieSettings?.shotCount ?? 1,
      lastPhotoAt: photos.length ? new Date(Math.max(...photos.map(a => a.createdAt.getTime()))) : null,
    }),
    boothOffline: !expired && isBoothOffline({ photoCount: photos.length, lastSeenAt: lastSeen }),
  });
}
