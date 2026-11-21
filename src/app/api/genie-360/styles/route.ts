export const dynamic = 'force-dynamic';
import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { styleView, styleWhere } from '@/lib/genie/spin360';

const Body = z.object({
  // The Standard style (or one of My styles) to start from
  fromId: z.string().min(1).max(80),
  name: z.string().trim().min(1, 'Give the style a name').max(40, 'Keep the name to 40 characters').optional(),
}).strict();

// My styles: a copy of a style the operator can change (name, speed ramp, capture). The Example video isn't copied.
export async function POST(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const from = await prisma.genieSpinStyle.findFirst({ where: { id: parsed.data.fromId, ...styleWhere(auth.tenantId) } });
  if (!from) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const count = await prisma.genieSpinStyle.count({ where: { tenantId: auth.tenantId } });
  if (count >= 30) return NextResponse.json({ error: 'You can have up to 30 styles of your own.' }, { status: 400 });
  const s = await prisma.genieSpinStyle.create({
    data: {
      id: 'my-' + randomUUID(), tenantId: auth.tenantId, name: (parsed.data.name ?? `${from.name} (mine)`).slice(0, 40), description: from.description,
      captureFps: from.captureFps, segments: from.segments as object, defaultEffects: from.defaultEffects as object, sortOrder: count,
    },
  });
  return NextResponse.json({ style: styleView(s) }, { status: 201 });
}
