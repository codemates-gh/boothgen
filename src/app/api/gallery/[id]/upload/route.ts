export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { getPresignedUploadUrl } from '@/lib/storage/r2';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json({ error: 'R2 not configured — check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME env vars' }, { status: 500 });
  }
  const { fileName, contentType } = await req.json();
  const key = 'galleries/' + session.tenantId + '/' + params.id + '/' + Date.now() + '-' + fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uploadUrl = await getPresignedUploadUrl(key, contentType);
  const publicUrl = (process.env.R2_PUBLIC_URL || '') + '/' + key;
  return NextResponse.json({ uploadUrl, key, publicUrl });
}
