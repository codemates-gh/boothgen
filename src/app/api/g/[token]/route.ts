export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const galleryCode = req.nextUrl.searchParams.get('code');

  const gallery = await prisma.gallery.findFirst({
    where: { clientToken: params.token },
    include: {
      event: { select: { title: true } },
      tenant: { include: { branding: { select: { companyName: true, logoUrl: true, primaryColor: true } } } },
      assets: { where: { approvalStatus: 'APPROVED' }, orderBy: { createdAt: 'asc' } },
    },
  });

  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const requiresAccessCode = !!gallery.accessCode;
  const galleryUnlocked = !requiresAccessCode || (galleryCode !== null && galleryCode === gallery.accessCode);

  return NextResponse.json({
    gallery: {
      id: gallery.id,
      title: gallery.title,
      isPublished: gallery.isPublished,
      isExpired: gallery.isExpired,
      requiresAccessCode,
      galleryUnlocked,
    },
    event: gallery.event,
    branding: gallery.tenant.branding,
    assets: galleryUnlocked && gallery.isPublished && !gallery.isExpired ? gallery.assets : [],
  });
}
