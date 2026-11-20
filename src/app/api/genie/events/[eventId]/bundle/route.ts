export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateDevice, genieError } from '@/lib/genie/auth';
import { buildEventBundle, eventEndsAt } from '@/lib/genie/bundle';
import { prisma } from '@/lib/prisma/client';
import { claimEventSlot } from '@/lib/genie/slots';

export async function GET(req: NextRequest, props: { params: Promise<{ eventId: string }> }) {
  const params = await props.params;
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;

  const result = await buildEventBundle(auth.tenant.id, params.eventId);
  if (!result.ok) return genieError(result.status, result.code, result.error);
  // Expired (48 hours after it ended): no longer operational. Operators can still open and duplicate it in BoothGen.
  if (Date.parse(String(result.bundle.validUntil)) <= Date.now()) {
    return genieError(409, 'event_expired', 'This event is over, so iPads can no longer run it. Duplicate it in BoothGen to run it again.');
  }

  // Ended (past its end time): only an iPad already running it may still download it (e.g. the party ran late, or
  // "Check for changes"). A new iPad can't load it; it's duplicated in BoothGen instead (G, 2026-11-20)
  const event = await prisma.event.findUniqueOrThrow({ where: { id: params.eventId }, select: { eventDate: true, startTime: true, endTime: true, genieSettings: { select: { timeZone: true } } } });
  if (eventEndsAt(event, event.genieSettings?.timeZone ?? 'UTC').getTime() <= Date.now()) {
    const mine = await prisma.genieEventDevice.findUnique({ where: { eventId_deviceId: { eventId: params.eventId, deviceId: auth.device.id } } });
    if (!mine || mine.releasedAt) {
      return genieError(409, 'event_expired', 'This event has ended, so it can no longer be loaded on an iPad. Duplicate it in BoothGen to run it again.');
    }
  }

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
