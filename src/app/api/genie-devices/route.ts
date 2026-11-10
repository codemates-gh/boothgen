export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { isLowStorage } from '@/lib/genie/auth';
import { activePairingCode } from '@/lib/genie/pairing';

// Paired iPads (removed ones are left out), the code waiting to be used, and whether a PIN is set
export async function GET() {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const [devices, code, tenant] = await Promise.all([
    prisma.genieDevice.findMany({
      where: { tenantId: auth.tenantId, revokedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        eventSlots: {
          where: { releasedAt: null },
          include: { event: { select: { id: true, title: true, eventDate: true } } },
        },
      },
    }),
    activePairingCode(auth.tenantId),
    prisma.tenant.findUniqueOrThrow({ where: { id: auth.tenantId }, select: { genieAttendantPinHash: true } }),
  ]);

  return NextResponse.json({
    devices: devices.map(d => {
      // Current event: the next (or today's) event it holds a spot on, else the latest one
      const events = d.eventSlots.map(s => s.event).sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
      const current = events.find(e => e.eventDate >= today) ?? events.at(-1) ?? null;
      return {
        id: d.id, name: d.name, model: d.model, appVersion: d.appVersion, prefix: d.prefix,
        lastSeenAt: d.lastSeenAt, createdAt: d.createdAt,
        storageFreeBytes: d.storageFreeBytes === null ? null : Number(d.storageFreeBytes),
        storageTotalBytes: d.storageTotalBytes === null ? null : Number(d.storageTotalBytes),
        storageReportedAt: d.storageReportedAt,
        lowStorage: isLowStorage(d),
        currentEvent: current,
        eventCount: events.length,
      };
    }),
    pairingCode: code ? { code: code.code, expiresAt: code.expiresAt } : null,
    pinSet: !!tenant.genieAttendantPinHash,
  });
}
