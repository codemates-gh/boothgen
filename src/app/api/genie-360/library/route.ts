export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { spin360Library } from '@/lib/genie/spin360';

// Genie 360 pickers: styles (with Example videos), songs, royalty-free music links, animated overlays, backdrops
export async function GET() {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(await spin360Library(auth.tenantId));
}
