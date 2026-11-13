export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { importStarterProps } from '@/lib/genie/props';

// Adds the starter props (content/genie-props) that aren't in the Standard library yet; edited ones are left alone
export async function POST() {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json(await importStarterProps());
  } catch (err) {
    console.error('[super-admin] props import failed', err);
    return NextResponse.json({ error: 'The import stopped partway: ' + (err instanceof Error ? err.message : String(err)) + '. Run it again to add the rest.' }, { status: 500 });
  }
}
