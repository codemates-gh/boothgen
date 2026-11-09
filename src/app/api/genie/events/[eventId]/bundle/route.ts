export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateDevice, genieError } from '@/lib/genie/auth';
import { buildEventBundle } from '@/lib/genie/bundle';

export async function GET(req: NextRequest, { params }: { params: { eventId: string } }) {
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;

  const result = await buildEventBundle(auth.tenant.id, params.eventId);
  if (!result.ok) return genieError(result.status, result.code, result.error);

  const etag = `"${result.bundleVersion}"`;
  const headers = { ETag: etag, 'Cache-Control': 'no-cache' };
  const ifNoneMatch = req.headers.get('if-none-match');
  if (ifNoneMatch && ifNoneMatch.split(',').map(t => t.trim().replace(/^W\//, '')).includes(etag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return NextResponse.json(result.bundle, { headers });
}
