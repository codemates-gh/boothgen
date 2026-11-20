export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireLibraryEditor } from '@/lib/genie/admin';
import { finishSpinUpload, trackView } from '@/lib/genie/spin360';

const Body = z.object({
  scope: z.enum(['mine', 'standard']),
  url: z.string().url(),
  name: z.string().trim().min(1, 'Give the song a name').max(80, 'Keep the name to 80 characters'),
  // Operators must confirm they have the rights; Standard tracks carry licence notes instead
  rightsConfirmed: z.boolean().optional(),
  moods: z.array(z.string().trim().min(1).max(30)).max(6).optional(),
  credit: z.string().trim().max(200).nullable().optional(),
  licenseNotes: z.string().trim().max(2000).nullable().optional(),
}).strict();

// Saves an uploaded MP3 / M4A as a song in the account's library (or Standard, from Super Admin)
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { scope, url, name, rightsConfirmed, moods, credit, licenseNotes } = parsed.data;
  const auth = await requireLibraryEditor(scope);
  if (auth instanceof NextResponse) return auth;
  if (scope === 'mine' && !rightsConfirmed) return NextResponse.json({ error: "Confirm you have the rights to use this song in your clients' videos.", path: 'rightsConfirmed' }, { status: 400 });
  const tenantId = scope === 'standard' ? null : auth.tenantId;
  const f = await finishSpinUpload('music', url, tenantId);
  if ('error' in f) return NextResponse.json({ error: f.error }, { status: 422 });
  const last = await prisma.genieMusicTrack.findFirst({ where: { tenantId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const t = await prisma.genieMusicTrack.create({
    data: {
      tenantId, name, file: f.file, durationMs: f.durationMs!, moods: moods ?? [], credit: credit || null,
      licenseNotes: scope === 'standard' ? licenseNotes || null : null,
      rightsConfirmedAt: scope === 'mine' ? new Date() : null, sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json({ track: trackView(t) }, { status: 201 });
}
