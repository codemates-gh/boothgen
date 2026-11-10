export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bundleValidUntil } from '@/lib/genie/bundle';
import { NOT_PRINT_SHEET } from '@/lib/genie/urls';

// Live view: guests' sessions in the order they arrived, each with its gallery image first, then shots
function liveOrder<T extends { genieSessionId: string | null; sortOrder: number; createdAt: Date }>(assets: T[]): T[] {
  const firstSeen = new Map<string, number>();
  for (const a of assets) {
    const t = a.createdAt.getTime();
    if (!firstSeen.has(a.genieSessionId!) || t < firstSeen.get(a.genieSessionId!)!) firstSeen.set(a.genieSessionId!, t);
  }
  return [...assets].sort((a, b) => (firstSeen.get(a.genieSessionId!)! - firstSeen.get(b.genieSessionId!)!) || a.genieSessionId!.localeCompare(b.genieSessionId!) || a.sortOrder - b.sortOrder);
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const galleryCode = req.nextUrl.searchParams.get('code');

  const gallery = await prisma.gallery.findFirst({
    where: { clientToken: params.token },
    include: {
      event: { select: { title: true, eventDate: true, endTime: true, genieSettings: { select: { guestLinkScope: true, timeZone: true } } } },
      tenant: { include: { branding: { select: { companyName: true, logoUrl: true, primaryColor: true } } } },
      assets: { where: { approvalStatus: 'APPROVED', ...NOT_PRINT_SHEET }, orderBy: [{ createdAt: 'asc' }] },
    },
  });

  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const requiresAccessCode = !!gallery.accessCode;
  const galleryUnlocked = !requiresAccessCode || (galleryCode !== null && galleryCode === gallery.accessCode);

  // Genie guest link scope "all": while the gallery is unpublished, show Genie photos live until the
  // event's offline window ends. Publishing (or the window ending) returns to the normal behaviour.
  const genie = gallery.event.genieSettings;
  const isLive = !gallery.isPublished && !gallery.isExpired && genie?.guestLinkScope === 'all'
    && Date.now() <= bundleValidUntil(gallery.event, genie.timeZone).getTime();

  const retentionSetting = await prisma.systemSetting.findUnique({ where: { key: 'gallery_expire_days' } });
  const expireDays = parseInt(retentionSetting?.value ?? '30', 10);

  return NextResponse.json({
    gallery: {
      id: gallery.id,
      title: gallery.title,
      isPublished: gallery.isPublished,
      isExpired: gallery.isExpired,
      isLive,
      requiresAccessCode,
      galleryUnlocked,
      expireDays,
    },
    event: { title: gallery.event.title, eventDate: gallery.event.eventDate },
    branding: gallery.tenant.branding,
    assets: !galleryUnlocked || gallery.isExpired ? []
      : gallery.isPublished ? gallery.assets
      : isLive ? liveOrder(gallery.assets.filter(a => a.genieSessionId))
      : [],
  });
}
