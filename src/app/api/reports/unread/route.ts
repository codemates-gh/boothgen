export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { reportViewer } from '@/lib/reports/server';

// Unread markers: the user's own reports with news, and (Super Admins) reports waiting on triage
export async function GET() {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  const [mine, admin] = await Promise.all([
    prisma.feedbackReport.count({ where: { userId: viewer.userId, reporterUnread: true } }),
    viewer.isAdmin ? prisma.feedbackReport.count({ where: { adminUnread: true } }) : Promise.resolve(0),
  ]);
  return NextResponse.json({ mine, admin, isAdmin: viewer.isAdmin });
}
