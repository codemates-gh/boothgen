export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { hashAttendantPin } from '@/lib/genie/pin';

// Attendant PIN for the iPad's operator screens; iPads get the hash on their next config sync. null clears it.
const Body = z.object({ pin: z.string().regex(/^\d{4,8}$/, 'Use 4 to 8 digits').nullable() }).strict();

export async function PUT(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  await prisma.tenant.update({ where: { id: auth.tenantId }, data: { genieAttendantPinHash: parsed.data.pin ? hashAttendantPin(parsed.data.pin) : null } });
  return NextResponse.json({ pinSet: !!parsed.data.pin });
}
