import { prisma } from '@/lib/prisma/client';

// Late Geniefied designs (Genie P13): when renders came back after the guest left, the iPad registers a second `gallery`
// for the session. The newer one replaces the earlier (kept as `gallerySuperseded`, the before/after "original" when no
// `galleryOriginal` came). If Geniefied is on and a text or email already went out for the session, each person gets
// the event's "Your Geniefied photo is ready" message (a share of kind aiReady, sent like any other).
export async function galleryReplaced(sessionId: string, newAssetId: string): Promise<boolean> {
  const { count } = await prisma.galleryAsset.updateMany({
    where: { genieSessionId: sessionId, genieKind: 'gallery', id: { not: newAssetId } },
    data: { genieKind: 'gallerySuperseded' },
  });
  if (count === 0) return false;
  const session = await prisma.genieSession.findUnique({ where: { id: sessionId }, select: { clientId: true, eventId: true, event: { select: { genieSettings: { select: { aiEnabled: true } } } } } });
  if (!session?.event.genieSettings?.aiEnabled) return true;
  // Only a session with Geniefied images: a plain change (a new filter) never texts "your Geniefied photo is ready"
  if (!(await prisma.genieAiRender.count({ where: { eventId: session.eventId, sessionClientId: session.clientId, status: 'done' } }))) return true;
  const sent = await prisma.genieShare.findMany({ where: { sessionId, kind: 'photos', status: { in: ['sent', 'delivered'] } } });
  for (const s of sent) {
    await prisma.genieShare.create({
      data: {
        tenantId: s.tenantId, eventId: s.eventId, sessionId, clientId: 'ready:' + s.id, kind: 'aiReady', channel: s.channel,
        destination: s.destination, firstName: s.firstName, smsConsentAt: s.smsConsentAt, smsConsentText: s.smsConsentText,
        requestedAt: new Date(),
      },
    }).catch(err => { if ((err as { code?: string })?.code !== 'P2002') throw err; });
  }
  return true;
}
