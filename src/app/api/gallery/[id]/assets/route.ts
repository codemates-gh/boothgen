export const dynamic = 'force-dynamic';
import { deleteEventRenderResults } from '@/lib/genie/ai/renders';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { NOT_BOOMERANG_POSTER } from '@/lib/genie/urls';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, r2KeyFromUrl } from '@/lib/storage/r2';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { url, fileName, fileSize, mimeType } = await req.json();
  const asset = await prisma.galleryAsset.create({
    data: { galleryId: params.id, url, filename: fileName || url.split('/').pop() || 'photo', fileSizeBytes: fileSize || 0, mimeType: mimeType || 'image/jpeg', assetType: 'PHOTO', approvalStatus: 'APPROVED' },
  });
  // Advance approval status off PENDING_UPLOAD once photos start arriving
  if (gallery.approvalStatus === 'PENDING_UPLOAD') {
    await prisma.gallery.update({ where: { id: params.id }, data: { approvalStatus: 'PENDING_REVIEW' } });
  }
  return NextResponse.json(asset, { status: 201 });
}

export async function GET(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const assets = await prisma.galleryAsset.findMany({ where: { galleryId: params.id, ...NOT_BOOMERANG_POSTER }, orderBy: { createdAt: 'asc' } });
  // Props on video (P14.1): the name of the prop a guest wore, while it's still in the library
  const propIds = Array.from(new Set(assets.map(a => a.propId).filter((id): id is string => !!id)));
  const names = propIds.length
    ? new Map((await prisma.genieProp.findMany({ where: { id: { in: propIds }, OR: [{ tenantId: null }, { tenantId: session.tenantId }] }, select: { id: true, name: true } })).map(p => [p.id, p.name]))
    : new Map<string, string>();
  return NextResponse.json(assets.map(a => (a.propId ? { ...a, propName: names.get(a.propId) ?? null } : a)));
}

export async function DELETE(_: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const assets = await prisma.galleryAsset.findMany({ where: { galleryId: params.id } });
  await Promise.allSettled(assets.map(a => deleteFromR2(r2KeyFromUrl(a.url))));
  await prisma.galleryAsset.deleteMany({ where: { galleryId: params.id } });
  if (gallery.eventId) await deleteEventRenderResults(gallery.eventId);
  return NextResponse.json({ deleted: assets.length });
}
