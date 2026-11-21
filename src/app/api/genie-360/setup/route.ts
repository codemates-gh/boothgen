export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { saveSpinSetup, spinSetup } from '@/lib/genie/spin360';
import { Spin360Patch } from '@/lib/genie/spin360Options';

// Genie → Genie 360: the setup new 360 events start from (copied onto an event when it turns 360 on)
export async function GET() {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ setup: await spinSetup(auth.tenantId) });
}

export async function PUT(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Spin360Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return NextResponse.json({ error: i?.message ?? 'Invalid request', path: 'spin360.' + (i?.path.join('.') ?? '') }, { status: 400 });
  }
  const r = await saveSpinSetup(parsed.data, auth.tenantId);
  if ('error' in r) return NextResponse.json({ error: r.error, path: r.path }, { status: 400 });
  return NextResponse.json({ setup: r.value });
}
