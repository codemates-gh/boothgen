export const dynamic = 'force-dynamic';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { getPresignedUploadUrl, r2PublicUrl } from '@/lib/storage/r2';
import { ATTRACT_IMAGE_SOURCE_MAX_BYTES, ATTRACT_SOURCE_TYPES, ATTRACT_VIDEO_SOURCE_MAX_BYTES, attractUploadPrefix, type AttractSourceType } from '@/lib/genie/attract';

const Body = z.object({
  contentType: z.enum(Object.keys(ATTRACT_SOURCE_TYPES) as [AttractSourceType, ...AttractSourceType[]], { errorMap: () => ({ message: 'Use a JPG or PNG image, or an MP4 or MOV video.' }) }),
  bytes: z.number().int().min(1),
}).strict();

// Presigned upload for an attract-screen source file; the browser PUTs it straight to R2, then calls /encode
export async function POST(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const type = ATTRACT_SOURCE_TYPES[parsed.data.contentType];
  if (type.kind === 'image' && parsed.data.bytes > ATTRACT_IMAGE_SOURCE_MAX_BYTES) return NextResponse.json({ error: 'Images must be 20 MB or smaller.' }, { status: 400 });
  if (type.kind === 'video' && parsed.data.bytes > ATTRACT_VIDEO_SOURCE_MAX_BYTES) return NextResponse.json({ error: 'Videos must be 200 MB or smaller.' }, { status: 400 });
  const key = attractUploadPrefix(auth.tenantId) + randomUUID() + '.' + type.ext;
  const uploadUrl = await getPresignedUploadUrl(key, parsed.data.contentType, parsed.data.bytes);
  return NextResponse.json({ uploadUrl, url: r2PublicUrl(key) });
}
