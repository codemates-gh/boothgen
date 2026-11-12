export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getPresignedDownloadUrl } from '@/lib/storage/r2';
import { attachmentsOf, reportViewer } from '@/lib/reports/server';

// Opens a report attachment through a short-lived link (attachments are private: reporter and Super Admins only)
export async function GET(_req: Request, { params }: { params: { id: string; index: string } }) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  const r = await prisma.feedbackReport.findUnique({ where: { id: params.id }, select: { userId: true, attachments: true } });
  if (!r || (!viewer.isAdmin && r.userId !== viewer.userId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const a = attachmentsOf(r.attachments)[Number(params.index)];
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.redirect(await getPresignedDownloadUrl(a.key), 302);
}
