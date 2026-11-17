export const dynamic = 'force-dynamic';
// Refresh: bring in new payments, fees and Genie event payments (src/lib/bookkeeping/sync.ts)
import { NextResponse } from 'next/server';
import { bookkeeper } from '@/lib/bookkeeping/auth';
import { syncLedger } from '@/lib/bookkeeping/sync';

export async function POST() {
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  return NextResponse.json(await syncLedger(who.tenantId));
}
