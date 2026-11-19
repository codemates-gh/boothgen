export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getGalleryRetention } from '@/lib/gallery/retention';
import { getUploadLimits } from '@/lib/gallery/uploadRules';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { notifyGalleryPublished } from '@/lib/gallery/publish';

export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const [gallery, { expireDays, deleteDays }] = await Promise.all([
    prisma.gallery.findFirst({
      where: { id: params.id, tenantId: session.tenantId },
      include: { event: { select: { title: true, eventDate: true, portalToken: true } }, _count: { select: { assets: true } } },
    }),
    getGalleryRetention(),
  ]);
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ...gallery, expireDays, deleteDays, uploadLimits: await getUploadLimits() });
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json();
  const updated = await prisma.gallery.update({
    where: { id: params.id },
    data: {
      ...(body.isPublished !== undefined && { isPublished: body.isPublished }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.accessCode !== undefined && { accessCode: body.accessCode || null }),
    },
    include: { event: { include: { client: true, tenant: { include: { branding: true } } } } },
  });

  // First publish: the client's email and the GALLERY_PUBLISHED automations (src/lib/gallery/publish.ts)
  if (body.isPublished === true && !gallery.isPublished) await notifyGalleryPublished(updated.id);

  return NextResponse.json(updated);
}
