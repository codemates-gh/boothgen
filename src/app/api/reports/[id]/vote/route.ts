export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { reportViewer, voteCount, votingOpen } from '@/lib/reports/server';

type Ctx = { params: { id: string } };

async function counts(reportId: string) {
  return voteCount(await prisma.feedbackFollower.findMany({ where: { reportId }, select: { voted: true } }));
}

// Vote for a suggestion / "This is my issue too" on a bug. Voting also follows the report (status and note
// emails). A vote on a duplicate goes to the original. Closed reports keep their count but take no new votes.
export async function POST(_req: Request, { params }: Ctx) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  let r = await prisma.feedbackReport.findUnique({ where: { id: params.id }, select: { id: true, userId: true, status: true, duplicateOfId: true } });
  if (r?.duplicateOfId) r = await prisma.feedbackReport.findUnique({ where: { id: r.duplicateOfId }, select: { id: true, userId: true, status: true, duplicateOfId: true } });
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  if (r.userId === viewer.userId) return NextResponse.json({ ok: true, reportId: r.id, voteCount: await counts(r.id) }); // the reporter's vote counts already
  if (!votingOpen(r.status)) return NextResponse.json({ error: 'This report is closed' }, { status: 400 });
  await prisma.feedbackFollower.upsert({
    where: { reportId_userId: { reportId: r.id, userId: viewer.userId } },
    create: { reportId: r.id, userId: viewer.userId, voted: true, following: true },
    update: { voted: true, following: true },
  });
  return NextResponse.json({ ok: true, reportId: r.id, voteCount: await counts(r.id) });
}

// Take the vote back (following stays as it is; it can be turned off separately)
export async function DELETE(_req: Request, { params }: Ctx) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  const r = await prisma.feedbackReport.findUnique({ where: { id: params.id }, select: { status: true } });
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  if (!votingOpen(r.status)) return NextResponse.json({ error: 'This report is closed' }, { status: 400 });
  await prisma.feedbackFollower.updateMany({ where: { reportId: params.id, userId: viewer.userId }, data: { voted: false } });
  return NextResponse.json({ ok: true, voteCount: await counts(params.id) });
}
