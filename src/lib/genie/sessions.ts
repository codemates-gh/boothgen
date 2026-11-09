import type { Event, Gallery, GenieSession } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { inngest } from '@/lib/inngest/client';

type GuestSessionInput = { id: string; publicToken: string; startedAt: string };

// The guest session for a device session id, created on first sight. Returns null when the id or
// public token already belongs to a different event (possibly another tenant).
export async function ensureGenieSession(
  event: Pick<Event, 'id' | 'tenantId'>,
  gallery: Pick<Gallery, 'id'>,
  deviceId: string,
  input: GuestSessionInput,
): Promise<GenieSession | null> {
  const owned = (s: GenieSession) => (s.eventId === event.id && s.tenantId === event.tenantId && s.publicToken === input.publicToken ? s : null);
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
