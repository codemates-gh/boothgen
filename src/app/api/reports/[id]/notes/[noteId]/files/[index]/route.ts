export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getPresignedDownloadUrl } from '@/lib/storage/r2';
import { attachmentsOf, reportViewer } from '@/lib/reports/server';

// Opens a note's attachment through a short-lived link. Internal notes' files are Super Admin only.
export async function GET(_req: Request, { params }: { params: { id: string; noteId: string; index: string } }) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  const n = await prisma.feedbackNote.findFirst({ where: { id: params.noteId, reportId: params.id }, select: { internal: true, attachments: true } });
  if (!n || (n.internal && !viewer.isAdmin)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const a = attachmentsOf(n.attachments)[Number(params.index)];
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.redirect(await getPresignedDownloadUrl(a.key), 302);
}
