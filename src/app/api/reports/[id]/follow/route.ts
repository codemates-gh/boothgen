export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { reportViewer } from '@/lib/reports/server';

type Ctx = { params: { id: string } };

// "This is my issue too": follow someone else's report (+1, and its status / note updates by email)
export async function POST(_req: Request, { params }: Ctx) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  const r = await prisma.feedbackReport.findUnique({ where: { id: params.id }, select: { id: true, userId: true, duplicateOfId: true } });
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  const target = r.duplicateOfId ?? r.id; // a duplicate's followers belong on the original
  const owner = target === r.id ? r.userId : (await prisma.feedbackReport.findUnique({ where: { id: target }, select: { userId: true } }))?.userId;
  if (owner === viewer.userId) return NextResponse.json({ ok: true, reportId: target, followerCount: await prisma.feedbackFollower.count({ where: { reportId: target } }) });
  await prisma.feedbackFollower.upsert({ where: { reportId_userId: { reportId: target, userId: viewer.userId } }, create: { reportId: target, userId: viewer.userId }, update: {} });
  await prisma.feedbackReport.update({ where: { id: target }, data: { updatedAt: new Date() }, select: { id: true } });
  return NextResponse.json({ ok: true, reportId: target, followerCount: await prisma.feedbackFollower.count({ where: { reportId: target } }) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  await prisma.feedbackFollower.deleteMany({ where: { reportId: params.id, userId: viewer.userId } });
  return NextResponse.json({ ok: true, followerCount: await prisma.feedbackFollower.count({ where: { reportId: params.id } }) });
}
