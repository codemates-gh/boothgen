export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { backdropView, deleteUnusedBackdropFiles, eventsUsingBackdrop } from '@/lib/genie/backdrops';

type Ctx = { params: { backdropId: string } };
const Body = z.union([
  z.object({ isActive: z.boolean() }).strict(),
  z.object({ name: z.string().trim().min(1, 'Give the backdrop a name').max(80, 'Keep the name to 80 characters') }).strict(),
]);

// Renames a Standard backdrop, or switches it on/off for every operator (events that chose it keep it)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const b = await prisma.genieBackdrop.findFirst({ where: { id: params.backdropId, tenantId: null } });
  if (!b) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  return NextResponse.json(backdropView(await prisma.genieBackdrop.update({ where: { id: b.id }, data: parsed.data })));
}

// Deletes a Standard backdrop no event uses (otherwise switch it off)
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const b = await prisma.genieBackdrop.findFirst({ where: { id: params.backdropId, tenantId: null } });
  if (!b) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const n = await eventsUsingBackdrop(b.id);
  if (n > 0) return NextResponse.json({ error: `${n === 1 ? 'An event uses' : `${n} events use`} this backdrop, so it can't be deleted. Switch it off instead: operators stop seeing it and those events keep it.`, code: 'in_use' }, { status: 409 });
  await prisma.genieBackdrop.delete({ where: { id: b.id } });
  await deleteUnusedBackdropFiles(b);
  return NextResponse.json({ ok: true });
}
