export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { reportViewer } from '@/lib/reports/server';

// Unread markers: reports the user filed or follows that have news, and (Super Admins) reports waiting on triage
export async function GET() {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  const [own, following, admin] = await Promise.all([
    prisma.feedbackReport.count({ where: { userId: viewer.userId, reporterUnread: true } }),
    prisma.feedbackFollower.count({ where: { userId: viewer.userId, following: true, unread: true } }),
    viewer.isAdmin ? prisma.feedbackReport.count({ where: { adminUnread: true } }) : Promise.resolve(0),
  ]);
  return NextResponse.json({ mine: own + following, admin, isAdmin: viewer.isAdmin });
}
