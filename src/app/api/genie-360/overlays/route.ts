export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireLibraryEditor } from '@/lib/genie/admin';
import { finishSpinUpload, overlayView } from '@/lib/genie/spin360';

const Body = z.object({
  scope: z.enum(['mine', 'standard']),
  url: z.string().url(),
  name: z.string().trim().min(1, 'Give the overlay a name').max(80, 'Keep the name to 80 characters'),
}).strict();

// Saves an uploaded animated overlay (animated PNG / WebP / GIF, or MOV with transparency) to the library
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { scope, url, name } = parsed.data;
  const auth = await requireLibraryEditor(scope);
  if (auth instanceof NextResponse) return auth;
  const tenantId = scope === 'standard' ? null : auth.tenantId;
  const f = await finishSpinUpload('overlay', url, tenantId);
  if ('error' in f) return NextResponse.json({ error: f.error }, { status: 422 });
  const last = await prisma.genieSpinOverlay.findFirst({ where: { tenantId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const o = await prisma.genieSpinOverlay.create({ data: { tenantId, name, file: f.file, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  return NextResponse.json({ overlay: overlayView(o) }, { status: 201 });
}
