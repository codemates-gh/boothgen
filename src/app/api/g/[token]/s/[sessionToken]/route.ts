export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

// One guest's Genie session: only that session's photos, independent of the gallery's publish state
export async function GET(_req: NextRequest, { params }: { params: { token: string; sessionToken: string } }) {
  const session = await prisma.genieSession.findUnique({
    where: { publicToken: params.sessionToken },
    include: {
      gallery: {
        select: {
          clientToken: true, isExpired: true,
          event: { select: { title: true, eventDate: true } },
          tenant: { select: { branding: { select: { companyName: true, logoUrl: true, primaryColor: true } } } },
        },
      },
      assets: {
        where: { approvalStatus: 'APPROVED' },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, url: true, width: true, height: true, genieKind: true },
      },
    },
  });
  // The session must belong to the gallery in the link
  if (!session || session.gallery.clientToken !== params.token) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    event: session.gallery.event,
    branding: session.gallery.tenant.branding,
    isExpired: session.gallery.isExpired,
    galleryUrl: '/g/' + session.gallery.clientToken,
    // Gallery image first, then shots; the printer sheet is offered as a download only
    assets: session.gallery.isExpired ? [] : session.assets.filter(a => a.genieKind !== 'print')
      .map(a => ({ id: a.id, url: a.url, width: a.width, height: a.height, isGallery: a.genieKind === 'gallery' })),
    printSheetUrl: session.gallery.isExpired ? null : session.assets.find(a => a.genieKind === 'print')?.url ?? null,
  });
}
