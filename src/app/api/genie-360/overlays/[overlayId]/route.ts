export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireLibraryEditor } from '@/lib/genie/admin';
import { deleteUnusedSpinFile, eventsUsingSpin, overlayView } from '@/lib/genie/spin360';
import type { RemoteAsset } from '@/lib/genie/templateAssets';

type Ctx = { params: Promise<{ overlayId: string }> };
const Patch = z.object({
  name: z.string().trim().min(1, 'Give the animated overlay a name').max(80, 'Keep the name to 80 characters'),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(100_000),
}).partial().strict();

// A Standard animated overlay (Super Admin) or one of the account's
async function find(id: string) {
  const t = await prisma.genieSpinOverlay.findUnique({ where: { id } });
  if (!t) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  const auth = await requireLibraryEditor(t.tenantId ? 'mine' : 'standard');
  if (auth instanceof NextResponse) return { error: auth };
  if (t.tenantId && t.tenantId !== auth.tenantId) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) };
  return { t };
}

export async function PATCH(req: NextRequest, props: Ctx) {
  const { overlayId } = await props.params;
  const f = await find(overlayId);
  if ('error' in f) return f.error;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  // Switching off is for Standard overlays
  const { isActive, ...rest } = parsed.data;
  const data = f.t.tenantId ? rest : parsed.data;
  void isActive;
  return NextResponse.json({ overlay: overlayView(await prisma.genieSpinOverlay.update({ where: { id: f.t.id }, data })) });
}

// Deletes a animated overlay no event uses (a Standard one in use can be switched off instead)
export async function DELETE(_req: NextRequest, props: Ctx) {
  const { overlayId } = await props.params;
  const f = await find(overlayId);
  if ('error' in f) return f.error;
  const n = await eventsUsingSpin('overlay', f.t.id);
  if (n > 0) return NextResponse.json({ error: `${n === 1 ? 'An event uses' : `${n} events use`} this animated overlay, so it can't be deleted.${f.t.tenantId ? ' Pick another overlay on those events first.' : ' Switch it off instead: operators stop seeing it and those events keep it.'}`, code: 'in_use' }, { status: 409 });
  await prisma.genieSpinOverlay.delete({ where: { id: f.t.id } });
  await deleteUnusedSpinFile((f.t.file as RemoteAsset).url);
  return NextResponse.json({ ok: true });
}
