export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireTemplateEditor } from '@/lib/genie/admin';
import { getR2Object } from '@/lib/storage/r2';
import { allowedPrefixes, keyForUrl } from '@/lib/genie/templateAssets';
import { readImageInfo } from '@/lib/genie/image';

// Same-origin copy of template artwork for the designer, so its canvas can draw it and export a thumbnail (and prop
// PNGs for the props editors)
export async function GET(req: NextRequest) {
  const auth = await requireTemplateEditor();
  if (auth instanceof NextResponse) return auth;
  const key = keyForUrl(req.nextUrl.searchParams.get('url') ?? '');
  // Prop PNGs and backdrops too (Standard, and the account's own)
  const prefixes = [...allowedPrefixes('mine', auth.tenantId), 'genie-props/standard/', 'genie-backdrops/standard/', ...(auth.tenantId ? [`genie-props/${auth.tenantId}/`, `genie-backdrops/${auth.tenantId}/`] : [])];
  if (!key || key.includes('..') || !prefixes.some(p => key.startsWith(p))) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const obj = await getR2Object(key);
  const info = obj ? readImageInfo(obj.body) : null;
  if (!obj || !info) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return new NextResponse(new Uint8Array(obj.body), { headers: { 'Content-Type': info.contentType, 'Cache-Control': 'private, max-age=3600' } });
}
