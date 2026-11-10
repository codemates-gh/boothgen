import { prisma } from '@/lib/prisma/client';

// Most recent contact from the iPads holding the event (undefined: no iPad known for it yet)
export async function eventBoothLastSeen(eventId: string): Promise<Date | null | undefined> {
  const slots = await prisma.genieEventDevice.findMany({
    where: { eventId, releasedAt: null, device: { revokedAt: null } },
    select: { device: { select: { lastSeenAt: true } } },
  });
  if (slots.length === 0) return undefined;
  const seen = slots.map(s => s.device.lastSeenAt?.getTime() ?? 0);
  const latest = Math.max(...seen);
  return latest ? new Date(latest) : null;
}
