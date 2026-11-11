export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTemplateEditor } from '@/lib/genie/admin';
import { getPresignedUploadUrl, r2PublicUrl } from '@/lib/storage/r2';
import { TEMPLATE_ASSET_MAX_BYTES, newAssetKey } from '@/lib/genie/templateAssets';

const Body = z.object({
  scope: z.enum(['mine', 'standard']),
  contentType: z.enum(['image/png', 'image/jpeg']),
  bytes: z.number().int().min(1).max(TEMPLATE_ASSET_MAX_BYTES, 'Images must be 15 MB or smaller'),
}).strict();

// Presigned upload for a background, overlay or thumbnail; the browser PUTs the file straight to R2
export async function POST(req: NextRequest) {
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Use a PNG or JPG image' }, { status: 400 });
  if (parsed.data.scope === 'standard' && !auth.superAdmin) return NextResponse.json({ error: 'Only BoothGen can change Standard templates' }, { status: 403 });
  if (parsed.data.scope === 'mine' && !auth.tenantId) return NextResponse.json({ error: 'Sign in to an account to make your own templates' }, { status: 400 });
  const key = newAssetKey(parsed.data.scope, auth.tenantId, parsed.data.contentType);
  const uploadUrl = await getPresignedUploadUrl(key, parsed.data.contentType, parsed.data.bytes);
  return NextResponse.json({ uploadUrl, url: r2PublicUrl(key) });
}
