export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

interface AssetInput {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { assets }: { assets: AssetInput[] } = await req.json();
  if (!Array.isArray(assets) || assets.length === 0) {
    return NextResponse.json({ error: 'No assets provided' }, { status: 400 });
  }

  await prisma.galleryAsset.createMany({
    data: assets.map(a => ({
      galleryId: params.id,
      url: a.url,
      filename: a.fileName || a.url.split('/').pop() || 'photo',
      fileSizeBytes: a.fileSize || 0,
      mimeType: a.mimeType || 'image/jpeg',
      assetType: 'PHOTO' as const,
      approvalStatus: 'APPROVED' as const,
    })),
  });

  return NextResponse.json({ count: assets.length }, { status: 201 });
}
