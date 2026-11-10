export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateDevice, genieError } from '@/lib/genie/auth';
import { buildEventBundle } from '@/lib/genie/bundle';
import { claimEventSlot } from '@/lib/genie/slots';

export async function GET(req: NextRequest, { params }: { params: { eventId: string } }) {
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;

  const result = await buildEventBundle(auth.tenant.id, params.eventId);
  if (!result.ok) return genieError(result.status, result.code, result.error);

  // Each event can be run by a limited number of devices; the first download takes a slot
  const slot = await claimEventSlot(auth.tenant.id, params.eventId, auth.device.id);
  if (!slot.ok) return genieError(409, slot.code, slot.error);

  const etag = `"${result.bundleVersion}"`;
  const headers = { ETag: etag, 'Cache-Control': 'no-cache' };
  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.split(',').map(t => t.trim().replace(/^W\//, '')).includes(etag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return NextResponse.json(result.bundle, { headers });
}
