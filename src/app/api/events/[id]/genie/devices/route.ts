export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';

// Devices holding (or released from) this event's Genie slots, plus paired iPads that can still open it
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const event = await prisma.event.findFirst({ where: { id: params.id, tenantId: auth.tenantId }, select: { id: true, genieSettings: { select: { maxDevices: true } } } });
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const rows = await prisma.genieEventDevice.findMany({
    where: { eventId: event.id },
    orderBy: { assignedAt: 'asc' },
    include: { device: { select: { id: true, name: true, model: true, appVersion: true, lastSeenAt: true, revokedAt: true } } },
  });
  // The account's other paired iPads: any of them can open this event while a spot is free
  const available = await prisma.genieDevice.findMany({
    where: { tenantId: auth.tenantId, revokedAt: null, id: { notIn: rows.map(r => r.deviceId) } },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, model: true, appVersion: true, lastSeenAt: true },
  });
  return NextResponse.json({
    maxDevices: event.genieSettings?.maxDevices ?? 2,
    used: rows.filter(r => !r.releasedAt).length,
    devices: rows.map(r => ({ ...r.device, assignedAt: r.assignedAt, releasedAt: r.releasedAt })),
    available,
  });
}

const Body = z.object({ deviceId: z.string().min(1), action: z.enum(['release', 'allow']) });

// release: frees the slot and stops that device syncing this event. allow: lets a released device claim a slot again.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const { deviceId, action } = parsed.data;

  const row = await prisma.genieEventDevice.findFirst({ where: { eventId: params.id, deviceId, tenantId: auth.tenantId } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (action === 'release') await prisma.genieEventDevice.update({ where: { id: row.id }, data: { releasedAt: row.releasedAt ?? new Date() } });
  else await prisma.genieEventDevice.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
