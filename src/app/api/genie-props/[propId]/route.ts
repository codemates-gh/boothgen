export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { PropBody, deleteUnusedPropImages, eventsUsingProp, propData, propView } from '@/lib/genie/props';
import type { RemoteAsset } from '@/lib/genie/templateAssets';

type Ctx = { params: { propId: string } };

// Edits one of My props (events that use it pick up the change on their next sync, until they lock)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const prop = await prisma.genieProp.findFirst({ where: { id: params.propId, tenantId: auth.tenantId } });
  if (!prop) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = PropBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const d = await propData(parsed.data, 'mine', auth.tenantId);
  if ('error' in d) return NextResponse.json({ error: d.error }, { status: 422 });
  const saved = await prisma.genieProp.update({ where: { id: prop.id }, data: d.data });
  await deleteUnusedPropImages([(prop.image as RemoteAsset).url]);
  return NextResponse.json(propView(saved));
}

// Deletes one of My props; refused while an event still offers it
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const prop = await prisma.genieProp.findFirst({ where: { id: params.propId, tenantId: auth.tenantId } });
  if (!prop) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const n = await eventsUsingProp(prop.id);
  if (n > 0) return NextResponse.json({ error: `${n === 1 ? 'An event offers' : `${n} events offer`} this prop. Remove it from ${n === 1 ? 'that event' : 'those events'} first.`, code: 'in_use' }, { status: 409 });
  await prisma.genieProp.delete({ where: { id: prop.id } });
  await deleteUnusedPropImages([(prop.image as RemoteAsset).url]);
  return NextResponse.json({ ok: true });
}
