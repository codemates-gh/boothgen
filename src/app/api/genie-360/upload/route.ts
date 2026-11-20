export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireLibraryEditor } from '@/lib/genie/admin';
import { getPresignedUploadUrl, r2PublicUrl } from '@/lib/storage/r2';
import { spinMaxBytes, spinTooBig, spinUploadKey } from '@/lib/genie/spin360';

const Body = z.object({
  scope: z.enum(['mine', 'standard']),
  // Example videos for 360 styles are Super Admin's only
  kind: z.enum(['music', 'overlay', 'sample']),
  contentType: z.string().min(1).max(100),
  bytes: z.number().int().min(1),
}).strict();

// Presigned upload for a Genie 360 song, animated overlay or style Example; the browser PUTs it to R2, then saves it
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { scope, kind, contentType, bytes } = parsed.data;
  if (kind === 'sample' && scope !== 'standard') return NextResponse.json({ error: 'Only BoothGen adds Example videos' }, { status: 403 });
  const auth = await requireLibraryEditor(scope);
  if (auth instanceof NextResponse) return auth;
  if (bytes > spinMaxBytes(kind)) return NextResponse.json({ error: spinTooBig(kind) }, { status: 400 });
  const k = spinUploadKey(kind, scope === 'standard' ? null : auth.tenantId, contentType);
  if ('error' in k) return NextResponse.json({ error: k.error }, { status: 400 });
  const uploadUrl = await getPresignedUploadUrl(k.key, contentType, bytes);
  return NextResponse.json({ uploadUrl, url: r2PublicUrl(k.key) });
}
