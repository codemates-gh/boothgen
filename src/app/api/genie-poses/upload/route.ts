export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireLibraryEditor } from '@/lib/genie/admin';
import { getPresignedUploadUrl, r2PublicUrl } from '@/lib/storage/r2';
import { POSE_SOURCE_MAX_BYTES, newPoseUploadKey } from '@/lib/genie/poses';

const Body = z.object({
  scope: z.enum(['mine', 'standard']),
  contentType: z.enum(['image/jpeg', 'image/png'], { errorMap: () => ({ message: 'Use a JPG or PNG image.' }) }),
  bytes: z.number().int().min(1).max(POSE_SOURCE_MAX_BYTES, 'Pose pictures must be 15 MB or smaller.'),
}).strict();

// Presigned upload for a pose picture; the browser PUTs it straight to R2, then calls /process
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const auth = await requireLibraryEditor(parsed.data.scope);
  if (auth instanceof NextResponse) return auth;
  const key = newPoseUploadKey(parsed.data.scope, auth.tenantId, parsed.data.contentType);
  const uploadUrl = await getPresignedUploadUrl(key, parsed.data.contentType, parsed.data.bytes);
  return NextResponse.json({ uploadUrl, url: r2PublicUrl(key) });
}
