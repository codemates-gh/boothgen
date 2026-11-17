export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { WEB_UPLOAD_TYPES, maxBytesFor, getUploadLimits, GB } from '@/lib/gallery/uploadRules';

interface AssetInput {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { assets }: { assets: AssetInput[] } = await req.json();
  if (!Array.isArray(assets) || assets.length === 0) {
    return NextResponse.json({ error: 'No assets provided' }, { status: 400 });
  }

  // Only files uploaded into this gallery's own folder, of an allowed type and size, within the per-event cap
  const prefix = (process.env.R2_PUBLIC_URL || '') + '/galleries/' + session.tenantId + '/' + params.id + '/';
  const limits = await getUploadLimits();
  const bad = assets.find(a => typeof a.url !== 'string' || !a.url.startsWith(prefix) || !WEB_UPLOAD_TYPES.includes(a.mimeType) || !(a.fileSize > 0 && a.fileSize <= maxBytesFor(a.mimeType, limits)));
  if (bad) return NextResponse.json({ error: 'One or more files were not uploaded to this gallery or are over the size limit' }, { status: 400 });
  const used = await prisma.galleryAsset.aggregate({ where: { galleryId: params.id }, _count: { _all: true }, _sum: { fileSizeBytes: true } });
  const incoming = assets.reduce((n, a) => n + a.fileSize, 0);
  if (used._count._all + assets.length > limits.galleryMaxFiles || (used._sum.fileSizeBytes ?? 0) + incoming > limits.galleryMaxGb * GB) {
    return NextResponse.json({ error: `This gallery is over its per-event limit (${limits.galleryMaxFiles.toLocaleString()} files or ${limits.galleryMaxGb} GB)` }, { status: 403 });
  }

  await prisma.galleryAsset.createMany({
    data: assets.map(a => ({
      galleryId: params.id,
      url: a.url,
      filename: a.fileName || a.url.split('/').pop() || 'photo',
      fileSizeBytes: a.fileSize || 0,
      mimeType: a.mimeType || 'image/jpeg',
      assetType: (a.mimeType.startsWith('video/') ? 'VIDEO' : 'PHOTO') as 'VIDEO' | 'PHOTO',
      approvalStatus: 'APPROVED' as const,
    })),
  });

  return NextResponse.json({ count: assets.length }, { status: 201 });
}
