export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { deleteUnusedSpinFile, finishSpinUpload, styleView } from '@/lib/genie/spin360';
import { Segments } from '@/lib/genie/spin360Options';

type Ctx = { params: Promise<{ styleId: string }> };
const Body = z.object({
  name: z.string().trim().min(1, 'Give the style a name').max(40, 'Keep the name to 40 characters'),
  description: z.string().trim().min(1, 'Add a one-line description').max(80, 'Keep the description to 80 characters'),
  captureFps: z.union([z.literal(120), z.literal(240)]),
  segments: Segments,
  defaultMusicId: z.string().min(1).nullable(),
  defaultEffects: z.object({ lightTrails: z.boolean().optional(), backgroundRemoval: z.boolean().optional() }).strict(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(1000),
  // An uploaded MP4 (from /api/genie-360/upload, kind sample) for the "Example" video; null removes it
  sampleUrl: z.string().url().nullable(),
}).partial().strict();

// Edits a 360 style. Changing its speed ramp or capture bumps its version (events pick the change up on their next bundle)
export async function PATCH(req: NextRequest, props: Ctx) {
  const { styleId } = await props.params;
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const style = await prisma.genieSpinStyle.findUnique({ where: { id: styleId } });
  if (!style) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request', path: parsed.error.issues[0]?.path.join('.') }, { status: 400 });
  const { sampleUrl, ...rest } = parsed.data;
  if (rest.defaultMusicId && !(await prisma.genieMusicTrack.findFirst({ where: { id: rest.defaultMusicId, tenantId: null } }))) {
    return NextResponse.json({ error: 'Pick a Standard song as the default' }, { status: 400 });
  }
  const data: Record<string, unknown> = { ...rest };
  const ramp = (rest.segments && JSON.stringify(rest.segments) !== JSON.stringify(style.segments)) || (rest.captureFps && rest.captureFps !== style.captureFps);
  if (ramp) data.version = style.version + 1;
  const oldFiles = [(style.sampleVideo as { url?: string } | null)?.url, (style.samplePoster as { url?: string } | null)?.url];
  if (sampleUrl === null) { data.sampleVideo = null; data.samplePoster = null; }
  if (sampleUrl) {
    const f = await finishSpinUpload('sample', sampleUrl, null);
    if ('error' in f) return NextResponse.json({ error: f.error }, { status: 422 });
    data.sampleVideo = f.file; data.samplePoster = f.poster ?? null;
  }
  const saved = await prisma.genieSpinStyle.update({ where: { id: style.id }, data });
  if (sampleUrl !== undefined) for (const u of oldFiles) await deleteUnusedSpinFile(u);
  return NextResponse.json({ style: styleView(saved) });
}
