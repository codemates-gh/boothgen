export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireLibraryEditor } from '@/lib/genie/admin';
import { getPresignedUploadUrl, r2PublicUrl } from '@/lib/storage/r2';
import { THEME_SOURCE_MAX_BYTES, newThemeUploadKey } from '@/lib/genie/ai/themes';

const Body = z.object({
  scope: z.enum(['mine', 'standard']),
  contentType: z.enum(['image/jpeg', 'image/png'], { errorMap: () => ({ message: 'Use a JPG or PNG image.' }) }),
  bytes: z.number().int().min(1).max(THEME_SOURCE_MAX_BYTES, 'Pictures must be 15 MB or smaller.'),
}).strict();

// Presigned upload for a theme's sample or a "Try it" photo; the browser PUTs it straight to R2
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const auth = await requireLibraryEditor(parsed.data.scope);
  if (auth instanceof NextResponse) return auth;
  const key = newThemeUploadKey(parsed.data.scope, auth.tenantId, parsed.data.contentType);
  const uploadUrl = await getPresignedUploadUrl(key, parsed.data.contentType, parsed.data.bytes);
  return NextResponse.json({ uploadUrl, url: r2PublicUrl(key) });
}
