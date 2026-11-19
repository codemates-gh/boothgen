export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireLibraryEditor } from '@/lib/genie/admin';
import { PoseKindInput, deleteUnusedPoseFiles, kindFor, poseView, processPoseUpload } from '@/lib/genie/poses';

const Body = z.object({
  scope: z.enum(['mine', 'standard']),
  url: z.string().url(),
  name: z.string().trim().min(1, 'Give the pose a name').max(80, 'Keep the name to 80 characters'),
  // Required for a new pose; a replaced picture keeps the pose's category unless one is sent
  kind: PoseKindInput.optional(),
  replaceId: z.string().min(1).optional(),
}).strict();

// Shrinks the uploaded picture (≤ 1200 px, thumbnail) and saves it as a pose, or replaces a pose's picture
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { scope, url, name, kind, replaceId } = parsed.data;
  if (!replaceId && !kind) return NextResponse.json({ error: 'Choose who the pose is for' }, { status: 400 });
  const auth = await requireLibraryEditor(scope);
  if (auth instanceof NextResponse) return auth;
  const tenantId = scope === 'standard' ? null : auth.tenantId;
  const existing = replaceId ? await prisma.geniePose.findFirst({ where: { id: replaceId, tenantId } }) : null;
  if (replaceId && !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const p = await processPoseUpload(url, scope, auth.tenantId);
  if ('error' in p) return NextResponse.json({ error: p.error }, { status: 422 });
  const data = { name, image: p.image, thumbnail: p.thumbnail, width: p.width, height: p.height, ...(kind ? kindFor(kind) : {}) };
  let saved;
  if (existing) {
    saved = await prisma.geniePose.update({ where: { id: existing.id }, data });
    await deleteUnusedPoseFiles(existing);
  } else {
    const last = await prisma.geniePose.findFirst({ where: { tenantId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    saved = await prisma.geniePose.create({ data: { ...data, ...kindFor(kind!), tenantId, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  }
  return NextResponse.json({ pose: poseView(saved) }, { status: existing ? 200 : 201 });
}
