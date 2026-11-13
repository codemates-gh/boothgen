export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { PropBody, deleteUnusedPropImages, eventsUsingProp, propData, propView } from '@/lib/genie/props';
import type { RemoteAsset } from '@/lib/genie/templateAssets';

type Ctx = { params: { propId: string } };
const Toggle = z.object({ isActive: z.boolean() }).strict();

// Edits a Standard prop, or switches it on/off for every operator ({isActive}). Off: it leaves operators' libraries
// and can't be newly chosen; events that already chose it keep it.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const prop = await prisma.genieProp.findFirst({ where: { id: params.propId, tenantId: null } });
  if (!prop) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const toggle = Toggle.safeParse(body);
  if (toggle.success) return NextResponse.json(propView(await prisma.genieProp.update({ where: { id: prop.id }, data: toggle.data })));
  const parsed = PropBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const d = await propData(parsed.data, 'standard', null);
  if ('error' in d) return NextResponse.json({ error: d.error }, { status: 422 });
  const saved = await prisma.genieProp.update({ where: { id: prop.id }, data: d.data });
  await deleteUnusedPropImages([(prop.image as RemoteAsset).url]);
  return NextResponse.json(propView(saved));
}

// Deletes a Standard prop no event uses (otherwise switch it off)
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const prop = await prisma.genieProp.findFirst({ where: { id: params.propId, tenantId: null } });
  if (!prop) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const n = await eventsUsingProp(prop.id);
  if (n > 0) return NextResponse.json({ error: `${n === 1 ? 'An event uses' : `${n} events use`} this prop, so it can't be deleted. Switch it off instead: operators stop seeing it and those events keep it.`, code: 'in_use' }, { status: 409 });
  await prisma.genieProp.delete({ where: { id: prop.id } });
  await deleteUnusedPropImages([(prop.image as RemoteAsset).url]);
  return NextResponse.json({ ok: true });
}
