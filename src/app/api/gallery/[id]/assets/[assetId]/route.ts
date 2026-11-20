export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, r2KeyFromUrl } from '@/lib/storage/r2';
import { isVideoMessage } from '@/lib/genie/videoBooth';

async function ownedGallery(id: string) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const gallery = await prisma.gallery.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!gallery) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { gallery };
}

export async function DELETE(
  _: NextRequest,
  props: { params: Promise<{ id: string; assetId: string }> }
) {
  const params = await props.params;
  const g = await ownedGallery(params.id);
  if ('error' in g) return g.error;
  const asset = await prisma.galleryAsset.findFirst({ where: { id: params.assetId, galleryId: params.id } });
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await prisma.galleryAsset.delete({ where: { id: asset.id } });
  // A Video Booth message (Genie P14) goes from storage too, with its poster
  if (isVideoMessage(asset)) {
    const posters = asset.genieSessionId
      ? await prisma.galleryAsset.findMany({ where: { genieSessionId: asset.genieSessionId, genieKind: 'videoPoster' }, select: { id: true, url: true } })
      : [];
    await prisma.galleryAsset.deleteMany({ where: { id: { in: posters.map(p => p.id) } } });
    await Promise.allSettled([asset.url, ...posters.map(p => p.url)].map(u => deleteFromR2(r2KeyFromUrl(u))));
  }
  return NextResponse.json({ success: true });
}

const Patch = z.object({ hidden: z.boolean() }).strict();

// Hide a Video Booth message from the public gallery and the guest's session page (or show it again)
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string; assetId: string }> }) {
  const params = await props.params;
  const g = await ownedGallery(params.id);
  if ('error' in g) return g.error;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const asset = await prisma.galleryAsset.findFirst({ where: { id: params.assetId, galleryId: params.id } });
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const saved = await prisma.galleryAsset.update({ where: { id: asset.id }, data: { hiddenAt: parsed.data.hidden ? (asset.hiddenAt ?? new Date()) : null } });
  return NextResponse.json(saved);
}
