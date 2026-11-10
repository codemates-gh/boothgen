export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';

async function findDevice(tenantId: string, id: string) {
  return prisma.genieDevice.findFirst({ where: { id, tenantId, revokedAt: null } });
}

const Rename = z.object({ name: z.string().trim().min(1, "Name can't be empty").max(80) }).strict();

export async function PATCH(req: NextRequest, { params }: { params: { deviceId: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Rename.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const device = await findDevice(auth.tenantId, params.deviceId);
  if (!device) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const saved = await prisma.genieDevice.update({ where: { id: device.id }, data: { name: parsed.data.name } });
  return NextResponse.json({ id: saved.id, name: saved.name });
}

// Removes the iPad: its token stops working at once (401 device_revoked) and its event spots open up.
// Photos it already uploaded stay.
export async function DELETE(_req: NextRequest, { params }: { params: { deviceId: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const device = await findDevice(auth.tenantId, params.deviceId);
  if (!device) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const now = new Date();
  await prisma.$transaction([
    prisma.genieDevice.update({ where: { id: device.id }, data: { revokedAt: now } }),
    prisma.genieEventDevice.updateMany({ where: { deviceId: device.id, releasedAt: null }, data: { releasedAt: now } }),
  ]);
  return NextResponse.json({ ok: true });
}
