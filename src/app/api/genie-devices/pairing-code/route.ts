export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { createPairingCode } from '@/lib/genie/pairing';
import { checkRateLimit } from '@/lib/rate-limit';

// Code the operator types into Genie on a new iPad
export async function POST() {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  if (!checkRateLimit('genie-pair-code:' + auth.tenantId, 20, 600000).success) {
    return NextResponse.json({ error: 'Too many codes. Wait a few minutes and try again.' }, { status: 429 });
  }
  const pc = await createPairingCode(auth.tenantId);
  return NextResponse.json({ code: pc.code, expiresAt: pc.expiresAt }, { status: 201 });
}
