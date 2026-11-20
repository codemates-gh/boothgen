export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireLibraryEditor } from '@/lib/genie/admin';
import { backdropView, deleteUnusedBackdropFiles, processBackdropUpload } from '@/lib/genie/backdrops';

const Body = z.object({
  scope: z.enum(['mine', 'standard']),
  url: z.string().url(),
  name: z.string().trim().min(1, 'Give the backdrop a name').max(80, 'Keep the name to 80 characters'),
  // Replaces this backdrop's picture instead of adding a new one
  replaceId: z.string().min(1).optional(),
  // A Genie 360 panorama (Standard only): up to 6000 px, tagged "360"
  pano: z.boolean().optional(),
}).strict();

// Shrinks the uploaded picture (≤ 1800 px, JPEG, thumbnail) and saves it as a backdrop
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { scope, url, name, replaceId } = parsed.data;
  const pano = scope === 'standard' && (parsed.data.pano ?? false);
  const auth = await requireLibraryEditor(scope);
  if (auth instanceof NextResponse) return auth;
  const tenantId = scope === 'standard' ? null : auth.tenantId;
  const existing = replaceId ? await prisma.genieBackdrop.findFirst({ where: { id: replaceId, tenantId } }) : null;
  if (replaceId && !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const p = await processBackdropUpload(url, scope, auth.tenantId, pano || !!existing?.tags.includes('360'));
  if ('error' in p) return NextResponse.json({ error: p.error }, { status: 422 });
  const data = { name, image: p.image, thumbnail: p.thumbnail, width: p.width, height: p.height };
  let saved;
  if (existing) {
    saved = await prisma.genieBackdrop.update({ where: { id: existing.id }, data });
    await deleteUnusedBackdropFiles(existing);
  } else {
    const last = await prisma.genieBackdrop.findFirst({ where: { tenantId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    saved = await prisma.genieBackdrop.create({ data: { ...data, tenantId, tags: pano ? ['360'] : [], sortOrder: (last?.sortOrder ?? -1) + 1 } });
  }
  return NextResponse.json({ backdrop: backdropView(saved), warning: p.warning }, { status: existing ? 200 : 201 });
}
