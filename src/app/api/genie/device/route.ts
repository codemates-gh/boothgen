export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { authenticateDevice, genieError, readJson } from '@/lib/genie/auth';

// The label the operator gives this iPad on the iPad itself (DeviceRename, renameDevice); same as BoothGen's Rename.
// GET /api/genie/config answers it back as deviceName.
const DeviceRename = z.object({ name: z.string().trim().min(1, "Name can't be empty").max(80, 'Name is longer than 80 characters') }).strict();

export async function PATCH(req: NextRequest) {
  const auth = await authenticateDevice(req);
  if (auth instanceof NextResponse) return auth;
  const parsed = DeviceRename.safeParse(await readJson(req));
  if (!parsed.success) return genieError(400, 'invalid_request', parsed.error.issues[0]?.message ?? 'Invalid request');
  const name = parsed.data.name;
  if (name !== auth.device.name) await prisma.genieDevice.update({ where: { id: auth.device.id }, data: { name } });
  return NextResponse.json({ name });
}
