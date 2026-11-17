export const dynamic = 'force-dynamic';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { getPresignedUploadUrl, r2PublicUrl } from '@/lib/storage/r2';
import { COUNTDOWN_SOURCE_MAX_BYTES, COUNTDOWN_SOURCE_TYPES, countdownUploadPrefix } from '@/lib/genie/countdownSound';

const Body = z.object({ contentType: z.string(), bytes: z.number().int().min(1) }).strict();

// Presigned upload for a custom countdown sound; the browser PUTs it straight to R2, then calls /encode
export async function POST(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const ext = COUNTDOWN_SOURCE_TYPES[parsed.data.contentType];
  if (!ext) return NextResponse.json({ error: 'Use an MP3, M4A, WAV or AIFF sound.' }, { status: 400 });
  if (parsed.data.bytes > COUNTDOWN_SOURCE_MAX_BYTES) return NextResponse.json({ error: 'Sounds must be 20 MB or smaller.' }, { status: 400 });
  const key = countdownUploadPrefix(auth.tenantId) + randomUUID() + '.' + ext;
  const uploadUrl = await getPresignedUploadUrl(key, parsed.data.contentType, parsed.data.bytes);
  return NextResponse.json({ uploadUrl, url: r2PublicUrl(key) });
}
