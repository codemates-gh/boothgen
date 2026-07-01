export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { deleteFromR2, r2KeyFromUrl } from '@/lib/storage/r2';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const assets = await prisma.galleryAsset.findMany({ where: { galleryId: params.id }, orderBy: { createdAt: 'asc' } });
  return NextResponse.json(assets);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const assets = await prisma.galleryAsset.findMany({ where: { galleryId: params.id } });
  await Promise.allSettled(assets.map(a => deleteFromR2(r2KeyFromUrl(a.url))));
  await prisma.galleryAsset.deleteMany({ where: { galleryId: params.id } });
  return NextResponse.json({ deleted: assets.length });
}
