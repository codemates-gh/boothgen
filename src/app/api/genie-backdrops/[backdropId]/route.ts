export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { backdropView, deleteUnusedBackdropFiles, eventsUsingBackdrop, removeBackdropFromEvents } from '@/lib/genie/backdrops';

type Ctx = { params: { backdropId: string } };
const Rename = z.object({ name: z.string().trim().min(1, 'Give the backdrop a name').max(80, 'Keep the name to 80 characters') }).strict();

// Renames one of My backdrops
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const b = await prisma.genieBackdrop.findFirst({ where: { id: params.backdropId, tenantId: auth.tenantId } });
  if (!b) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = Rename.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  return NextResponse.json(backdropView(await prisma.genieBackdrop.update({ where: { id: b.id }, data: parsed.data })));
}

// Deletes one of My backdrops. If events use it, the first call answers 409 with how many; ?confirm=1 deletes it
// and takes it off those events.
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const b = await prisma.genieBackdrop.findFirst({ where: { id: params.backdropId, tenantId: auth.tenantId } });
  if (!b) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const n = await eventsUsingBackdrop(b.id);
  if (n > 0 && req.nextUrl.searchParams.get('confirm') !== '1') {
    return NextResponse.json({ error: `${n === 1 ? 'An event uses' : `${n} events use`} this backdrop. Deleting it takes it off ${n === 1 ? 'that event' : 'those events'}.`, code: 'in_use', events: n }, { status: 409 });
  }
  if (n > 0) await removeBackdropFromEvents(b.id);
  await prisma.genieBackdrop.delete({ where: { id: b.id } });
  await deleteUnusedBackdropFiles(b);
  return NextResponse.json({ ok: true });
}
