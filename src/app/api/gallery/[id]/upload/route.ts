export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { canAddGalleryPhotos, GALLERY_LIMIT_MESSAGE } from '@/lib/gallery/planLimit';
import { WEB_UPLOAD_TYPES, getUploadLimits, fileSizeBlock, galleryUploadBlock } from '@/lib/gallery/uploadRules';
import { getPresignedUploadUrl } from '@/lib/storage/r2';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { event: { select: { eventDate: true } } } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await canAddGalleryPhotos(session.tenantId, gallery.id))) return NextResponse.json({ error: GALLERY_LIMIT_MESSAGE, upgrade: true }, { status: 403 });
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json({ error: 'R2 not configured — check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME env vars' }, { status: 500 });
  }
  const { fileName, contentType, bytes } = await req.json();
  // Photos, GIFs and short videos within the size limits (Super Admin → Settings); the size is signed into the upload
  // link so storage refuses anything bigger
  if (!WEB_UPLOAD_TYPES.includes(contentType)) return NextResponse.json({ error: `${fileName} can't be added: galleries take photos (JPG, PNG, HEIC, WebP), GIFs and videos (MP4, MOV).`, rule: true }, { status: 400 });
  if (!Number.isInteger(bytes) || bytes < 1) return NextResponse.json({ error: 'File size missing. Refresh the page and try again.' }, { status: 400 });
  const limits = await getUploadLimits();
  const tooBig = fileSizeBlock(fileName, contentType, bytes, limits);
  if (tooBig) return NextResponse.json({ error: tooBig, rule: true }, { status: 400 });
  const blocked = await galleryUploadBlock(gallery.id, gallery.event.eventDate, bytes, limits);
  if (blocked) return NextResponse.json({ error: blocked, rule: true }, { status: 403 });
  const key = 'galleries/' + session.tenantId + '/' + params.id + '/' + Date.now() + '-' + fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uploadUrl = await getPresignedUploadUrl(key, contentType, bytes);
  const publicUrl = (process.env.R2_PUBLIC_URL || '') + '/' + key;
  return NextResponse.json({ uploadUrl, key, publicUrl });
}
