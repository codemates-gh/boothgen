export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
// Clerk webhooks are no longer used — stub to prevent build errors
export async function POST() {
  return NextResponse.json({ received: true });
}
