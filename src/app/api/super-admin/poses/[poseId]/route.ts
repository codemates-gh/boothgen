export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { PoseKindInput, deleteUnusedPoseFiles, kindFor, placesUsingPose, poseView } from '@/lib/genie/poses';

type Ctx = { params: Promise<{ poseId: string }> };
const Body = z.object({
  isActive: z.boolean().optional(),
  name: z.string().trim().min(1, 'Give the pose a name').max(80, 'Keep the name to 80 characters').optional(),
  kind: PoseKindInput.optional(),
}).strict();

// Edits a Standard pose (name, who it's for), or switches it on/off for every operator (events that chose it keep it)
export async function PATCH(req: NextRequest, props: Ctx) {
  const params = await props.params;
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const p = await prisma.geniePose.findFirst({ where: { id: params.poseId, tenantId: null } });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { kind, ...rest } = parsed.data;
  return NextResponse.json(poseView(await prisma.geniePose.update({ where: { id: p.id }, data: { ...rest, ...(kind ? kindFor(kind) : {}) } })));
}

// Deletes a Standard pose nothing uses (otherwise switch it off)
export async function DELETE(_req: NextRequest, props: Ctx) {
  const params = await props.params;
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const p = await prisma.geniePose.findFirst({ where: { id: params.poseId, tenantId: null } });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const used = await placesUsingPose(p.id);
  if (used.events || used.defaults) {
    return NextResponse.json({ error: `Events or Event defaults use this pose (${used.events} events, ${used.defaults} accounts' defaults), so it can't be deleted. Switch it off instead: operators stop seeing it and those keep it.`, code: 'in_use' }, { status: 409 });
  }
  await prisma.geniePose.delete({ where: { id: p.id } });
  await deleteUnusedPoseFiles(p);
  return NextResponse.json({ ok: true });
}
