export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireTemplateEditor } from '@/lib/genie/admin';
import { allowedPrefixes, verifyAsset } from '@/lib/genie/templateAssets';
import { artworkFit } from '@/lib/genie/image';

const Body = z.object({
  url: z.string().url(),
  scope: z.enum(['mine', 'standard']),
  canvas: z.object({ widthPx: z.number().int().min(1), heightPx: z.number().int().min(1) }).strict().optional(),
}).strict();

// After the upload: the file's real type, pixel size, transparency and sha256, plus whether it fits the layout
export async function POST(req: NextRequest) {
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const v = await verifyAsset(parsed.data.url, allowedPrefixes(parsed.data.scope, auth.tenantId));
  if ('error' in v) return NextResponse.json({ error: v.error }, { status: 422 });
  const fit = parsed.data.canvas ? artworkFit(v.info, parsed.data.canvas) : { ok: true as const };
  if (!fit.ok) return NextResponse.json({ error: fit.error }, { status: 422 });
  return NextResponse.json({ asset: v.asset, width: v.info.width, height: v.info.height, hasAlpha: v.info.hasAlpha, warning: 'warning' in fit ? fit.warning : undefined });
}
