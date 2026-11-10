export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bundleValidUntil } from '@/lib/genie/bundle';

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const galleryCode = req.nextUrl.searchParams.get('code');

  const gallery = await prisma.gallery.findFirst({
    where: { clientToken: params.token },
    include: {
      event: { select: { title: true, eventDate: true, endTime: true, genieSettings: { select: { guestLinkScope: true, timeZone: true } } } },
      tenant: { include: { branding: { select: { companyName: true, logoUrl: true, primaryColor: true } } } },
      assets: { where: { approvalStatus: 'APPROVED' }, orderBy: { createdAt: 'asc' } },
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
      : isLive ? gallery.assets.filter(a => a.genieSessionId)
      : [],
  });
}
