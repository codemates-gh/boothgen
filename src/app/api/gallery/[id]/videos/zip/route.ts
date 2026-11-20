export const dynamic = 'force-dynamic';
export const maxDuration = 300;
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { downloadZip } from 'client-zip';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { getR2ObjectStream, r2KeyFromUrl } from '@/lib/storage/r2';
import { VIDEO_MESSAGE } from '@/lib/genie/videoBooth';

// "Download all videos" (Genie P14 Video Booth): every video message of the gallery in one ZIP, streamed from R2 file by
// file (never held in memory). Hidden videos are included: the host owns them.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const gallery = await prisma.gallery.findFirst({ where: { id: params.id, tenantId: session.tenantId }, select: { id: true, title: true } });
  if (!gallery) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const videos = await prisma.galleryAsset.findMany({ where: { galleryId: gallery.id, ...VIDEO_MESSAGE }, orderBy: { createdAt: 'asc' }, select: { url: true, createdAt: true } });
  if (videos.length === 0) return NextResponse.json({ error: 'No videos yet' }, { status: 404 });

  // One R2 read at a time, as the ZIP is written
  async function* files() {
    for (const [i, v] of videos.entries()) {
      const obj = await getR2ObjectStream(r2KeyFromUrl(v.url)).catch(err => { console.error('[video-zip] read failed', v.url, err); return null; });
      if (!obj) continue;
      yield { name: `video-${String(i + 1).padStart(3, '0')}.mp4`, input: obj.body, ...(obj.bytes !== null ? { size: obj.bytes } : {}), lastModified: v.createdAt };
    }
  }
  const zip = downloadZip(files());
  const name = (gallery.title || 'event').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'event';
  return new Response(zip.body, {
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}-videos.zip"`, 'Cache-Control': 'no-store' },
  });
}
