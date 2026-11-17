export const dynamic = 'force-dynamic';
export const maxDuration = 120;
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { encodeCountdownSound } from '@/lib/genie/countdownSound';

const Body = z.object({ url: z.string().url(), name: z.string().max(200).optional() }).strict();

// Re-encodes an uploaded sound once (mono AAC .m4a, at most 15 s) and stores it; save the returned sound.url as
// capture.countdownSound.custom.url
export async function POST(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const r = await encodeCountdownSound(auth.tenantId, parsed.data.url, parsed.data.name ?? 'Custom sound');
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 });
  return NextResponse.json(r);
}
