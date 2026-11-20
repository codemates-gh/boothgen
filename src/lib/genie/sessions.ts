import type { Event, Gallery, GenieSession } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { inngest } from '@/lib/inngest/client';
import { eventLocksAt } from '@/lib/genie/bundle';

type GuestSessionInput = { id: string; publicToken: string; startedAt: string };

// Before the event day (12:00 AM in its time zone) an event is test-only (G, 2026-11-20): paying early doesn't buy extra
// days, so a new guest session (its photos and shares) is refused until the day starts. The iPad's own clock may be a
// little off, so a session it started up to an hour early is accepted once the day has begun.
const CLOCK_SKEW_MS = 3600_000;
export async function beforeEventDay(eventId: string, startedAt: string, now = new Date()): Promise<boolean> {
  const e = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { eventDate: true, genieSettings: { select: { timeZone: true } } } });
  const opens = eventLocksAt(e, e.genieSettings?.timeZone ?? 'UTC');
  return now < opens || Date.parse(startedAt) < opens.getTime() - CLOCK_SKEW_MS;
}
export const NOT_STARTED_MESSAGE = "The event day hasn't started yet, so guest photos can't be saved or shared. Before the event day the booth is for testing only.";

// The guest session for a device session id, created on first sight. Returns null when the id or
// public token already belongs to a different event (possibly another tenant).
export async function ensureGenieSession(
  event: Pick<Event, 'id' | 'tenantId'>,
  gallery: Pick<Gallery, 'id'>,
  deviceId: string,
  input: GuestSessionInput,
): Promise<GenieSession | null> {
  // A deleted session (tombstone) is returned whatever its token, so the caller answers 410 session_deleted
  const owned = (s: GenieSession) => (s.eventId === event.id && s.tenantId === event.tenantId && (s.publicToken === input.publicToken || s.deletedAt) ? s : null);
  const existing = await prisma.genieSession.findUnique({ where: { clientId: input.id } });
  if (existing) return owned(existing);
  try {
    return await prisma.genieSession.create({
      data: {
        tenantId: event.tenantId, eventId: event.id, galleryId: gallery.id, deviceId,
        clientId: input.id, publicToken: input.publicToken, startedAt: new Date(input.startedAt),
      },
    });
  } catch (err) {
    if ((err as any)?.code !== 'P2002') throw err;
    const raced = await prisma.genieSession.findUnique({ where: { clientId: input.id } });
    return raced ? owned(raced) : null;
  }
}

// Hand queued shares to Inngest once the session has at least one photo. The event id dedupes
// repeats, so calling this from both the share and the asset routes sends each share once.
export async function dispatchReadyShares(sessionId: string): Promise<void> {
  const assets = await prisma.galleryAsset.count({ where: { genieSessionId: sessionId } });
  if (assets === 0) return;
  const shares = await prisma.genieShare.findMany({ where: { sessionId, status: 'queued' }, select: { id: true } });
  if (shares.length === 0) return;
  try {
    await inngest.send(shares.map(s => ({ id: 'genie-share-' + s.id, name: 'genie/share.send', data: { shareId: s.id } })));
  } catch (err) {
    console.error('[GENIE_SHARE_DISPATCH]', err);
  }
}
