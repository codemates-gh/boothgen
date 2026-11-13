export const dynamic = 'force-dynamic';
// Video encoding can take a minute or two for a long 4K source
export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { attractView } from '@/lib/genie/attract';
import { encodeAttract } from '@/lib/genie/attractEncode';

const Body = z.object({ url: z.string().url() }).strict();

// Shrinks an uploaded source for the iPad and stores the result; save the returned media.url as attract.mediaUrl
export async function POST(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const r = await encodeAttract(auth.tenantId, parsed.data.url);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 });
  return NextResponse.json({ media: attractView(r.attract, 0).media, sourceBytes: r.sourceBytes, trimmed: r.trimmed });
}
