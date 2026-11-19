export const dynamic = 'force-dynamic';
export const maxDuration = 120;
import { NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { importStarterPoses } from '@/lib/genie/poses';

// Adds the starter poses (content/genie-poses) that aren't in the Standard library yet
export async function POST() {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await importStarterPoses());
  } catch (err) {
    console.error('[super-admin] poses import failed', err);
    return NextResponse.json({ error: 'The import stopped partway: ' + (err instanceof Error ? err.message : String(err)) + '. Run it again to add the rest.' }, { status: 500 });
  }
}
