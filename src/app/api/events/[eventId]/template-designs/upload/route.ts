export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { getPresignedUploadUrl } from '@/lib/storage/r2';

export async function POST(req: NextRequest, { params }: { params: { eventId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const event = await prisma.event.findFirst({ where: { id: params.eventId, tenantId: session.tenantId } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { fileName, contentType } = await req.json();
  if (!fileName || !contentType) return NextResponse.json({ error: 'fileName and contentType are required' }, { status: 400 });

  const key = 'templates/' + session.tenantId + '/' + params.eventId + '/' + Date.now() + '-' + fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uploadUrl = await getPresignedUploadUrl(key, contentType);
  const publicUrl = (process.env.R2_PUBLIC_URL || '') + '/' + key;
  return NextResponse.json({ uploadUrl, key, publicUrl });
}
