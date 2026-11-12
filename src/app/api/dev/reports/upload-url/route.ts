export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { getPresignedUploadUrl } from '@/lib/storage/r2';
import { devAuthorized } from '@/lib/reports/devApi';
import { uploadPrefix } from '@/lib/reports/attachments';
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TYPES } from '@/lib/reports/options';

const Body = z.object({
  contentType: z.string().refine(t => t in ATTACHMENT_TYPES, 'Attach images, videos (MP4/MOV) or PDFs'),
  bytes: z.number().int().min(1).max(ATTACHMENT_MAX_BYTES, 'Files must be 100 MB or smaller'),
}).strict();

// Upload slot for a Dev note's screenshot (e.g. the fixed screen); PUT the file, then send its key with the note
export async function POST(req: NextRequest) {
  const denied = devAuthorized(req);
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid file' }, { status: 400 });
  const key = `${uploadPrefix(null)}${randomUUID()}.${ATTACHMENT_TYPES[parsed.data.contentType]}`;
  return NextResponse.json({ uploadUrl: await getPresignedUploadUrl(key, parsed.data.contentType, parsed.data.bytes), key });
}
