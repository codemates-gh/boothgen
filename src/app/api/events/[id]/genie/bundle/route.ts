export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { buildEventBundle } from '@/lib/genie/bundle';

// The bundle exactly as an iPad would download it (for the dashboard's JSON preview)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const result = await buildEventBundle(auth.tenantId, params.id);
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  return NextResponse.json(result.bundle);
}
