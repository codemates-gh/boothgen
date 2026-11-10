import { prisma } from '@/lib/prisma/client';

export type SlotResult = { ok: true } | { ok: false; code: 'event_device_limit' | 'event_device_released'; error: string };

// Gives the device one of the event's slots (or confirms it already has one). The settings row is locked so
// two devices can't both take the last slot.
export async function claimEventSlot(tenantId: string, eventId: string, deviceId: string): Promise<SlotResult> {
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ maxDevices: number }[]>`SELECT "maxDevices" FROM event_genie_settings WHERE "eventId" = ${eventId} AND "tenantId" = ${tenantId} FOR UPDATE`;
    const maxDevices = locked[0]?.maxDevices ?? 2;
    const mine = await tx.genieEventDevice.findUnique({ where: { eventId_deviceId: { eventId, deviceId } } });
    if (mine && !mine.releasedAt) return { ok: true } as const;
    if (mine?.releasedAt) {
      return { ok: false, code: 'event_device_released', error: 'This iPad was released from this event in BoothGen. Allow it again there to keep using it.' } as const;
    }
    const active = await tx.genieEventDevice.count({ where: { eventId, releasedAt: null } });
    if (active >= maxDevices) {
      return { ok: false, code: 'event_device_limit', error: `This event already has ${maxDevices} Genie device${maxDevices === 1 ? '' : 's'}. Release one in BoothGen to use this iPad.` } as const;
    }
    await tx.genieEventDevice.create({ data: { tenantId, eventId, deviceId } });
    return { ok: true } as const;
  });
}

// Per-event slot status for one device, for the device's event list
export async function slotStatusForDevice(deviceId: string, events: { id: string; maxDevices: number }[]) {
  const ids = events.map(e => e.id);
  const [active, mine] = await Promise.all([
    prisma.genieEventDevice.groupBy({ by: ['eventId'], where: { eventId: { in: ids }, releasedAt: null }, _count: { _all: true } }),
    prisma.genieEventDevice.findMany({ where: { eventId: { in: ids }, deviceId }, select: { eventId: true, releasedAt: true } }),
  ]);
  const activeBy = new Map(active.map(a => [a.eventId, a._count._all]));
  const mineBy = new Map(mine.map(m => [m.eventId, m]));
  return new Map(events.map(e => {
    const m = mineBy.get(e.id);
    return [e.id, {
      assignedToThisDevice: !!m && !m.releasedAt,
      releasedFromThisDevice: !!m?.releasedAt,
      deviceSlotsAvailable: Math.max(0, e.maxDevices - (activeBy.get(e.id) ?? 0)),
      maxDevices: e.maxDevices,
    }];
  }));
}
