export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { libraryPoses, poseView } from '@/lib/genie/poses';

// The operator's pose library: Standard poses that are switched on, plus My poses
export async function GET() {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const all = (await libraryPoses(auth.tenantId)).map(poseView);
  return NextResponse.json({ standard: all.filter(p => p.source === 'standard'), mine: all.filter(p => p.source === 'account') });
}
