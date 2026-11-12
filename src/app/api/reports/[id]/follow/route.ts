export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { reportViewer } from '@/lib/reports/server';

type Ctx = { params: { id: string } };

// Get (POST) or stop (DELETE) a report's status and note emails, without changing a vote
export async function POST(_req: Request, { params }: Ctx) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  const r = await prisma.feedbackReport.findUnique({ where: { id: params.id }, select: { id: true, userId: true } });
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  if (r.userId !== viewer.userId) {
    await prisma.feedbackFollower.upsert({
      where: { reportId_userId: { reportId: r.id, userId: viewer.userId } },
      create: { reportId: r.id, userId: viewer.userId, voted: false, following: true },
      update: { following: true },
    });
  }
  return NextResponse.json({ ok: true, following: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  await prisma.feedbackFollower.updateMany({ where: { reportId: params.id, userId: viewer.userId }, data: { following: false, unread: false } });
  return NextResponse.json({ ok: true, following: false });
}
