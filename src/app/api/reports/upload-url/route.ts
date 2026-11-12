export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getPresignedUploadUrl } from '@/lib/storage/r2';
import { reportViewer } from '@/lib/reports/server';
import { uploadPrefix } from '@/lib/reports/attachments';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from '@/lib/reports/options';
import { checkRateLimit } from '@/lib/rate-limit';

const Body = z.object({
  contentType: z.string().refine(t => t in ATTACHMENT_TYPES, 'Attach images, videos (MP4/MOV) or PDFs'),
  bytes: z.number().int().min(1).max(ATTACHMENT_MAX_BYTES, 'Files must be 100 MB or smaller'),
}).strict();

// Presigned upload for one report attachment; the browser PUTs the file straight to R2 (private, under the user's prefix)
export async function POST(req: NextRequest) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!checkRateLimit('report-upload:' + viewer.userId, 30, 3600_000).success) return NextResponse.json({ error: 'Too many uploads, try again later' }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid file' }, { status: 400 });
  const key = `${uploadPrefix(viewer.userId)}${randomUUID()}.${ATTACHMENT_TYPES[parsed.data.contentType]}`;
  const uploadUrl = await getPresignedUploadUrl(key, parsed.data.contentType, parsed.data.bytes);
  return NextResponse.json({ uploadUrl, key });
}
