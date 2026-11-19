export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { PoseKindInput, deleteUnusedPoseFiles, kindFor, placesUsingPose, poseView, removePoseEverywhere } from '@/lib/genie/poses';

type Ctx = { params: Promise<{ poseId: string }> };
const Edit = z.object({
  name: z.string().trim().min(1, 'Give the pose a name').max(80, 'Keep the name to 80 characters').optional(),
  kind: PoseKindInput.optional(),
}).strict();

// Renames one of My poses or changes who it's for
export async function PATCH(req: NextRequest, props: Ctx) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const p = await prisma.geniePose.findFirst({ where: { id: params.poseId, tenantId: auth.tenantId } });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = Edit.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { name, kind } = parsed.data;
  return NextResponse.json(poseView(await prisma.geniePose.update({ where: { id: p.id }, data: { ...(name ? { name } : {}), ...(kind ? kindFor(kind) : {}) } })));
}

// Deletes one of My poses. If events or the Event defaults use it, the first call answers 409; ?confirm=1 deletes it
// and takes it off them.
export async function DELETE(req: NextRequest, props: Ctx) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const p = await prisma.geniePose.findFirst({ where: { id: params.poseId, tenantId: auth.tenantId } });
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const used = await placesUsingPose(p.id);
  if ((used.events || used.defaults) && req.nextUrl.searchParams.get('confirm') !== '1') {
    const where = [used.events ? (used.events === 1 ? 'an event' : `${used.events} events`) : '', used.defaults ? 'your Event defaults' : ''].filter(Boolean).join(' and ');
    return NextResponse.json({ error: `This pose is used on ${where}. Deleting it takes it off.`, code: 'in_use', ...used }, { status: 409 });
  }
  if (used.events || used.defaults) await removePoseEverywhere(p.id);
  await prisma.geniePose.delete({ where: { id: p.id } });
  await deleteUnusedPoseFiles(p);
  return NextResponse.json({ ok: true });
}
