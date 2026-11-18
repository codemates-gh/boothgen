export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { devAuthorized, devView } from '@/lib/reports/devApi';
import { loadReport } from '@/lib/reports/server';

// Reports assigned to Dev, oldest assignment first (?all=1 also includes Fix ready and closed ones still assigned).
// Suggestions On the roadmap are never listed: they're planned work (roadmap items live elsewhere, src/lib/roadmap).
export async function GET(req: NextRequest) {
  const denied = devAuthorized(req);
  if (denied) return denied;
  const all = req.nextUrl.searchParams.get('all') === '1';
  const rows = await prisma.feedbackReport.findMany({
    where: { assignedToDev: true, status: { notIn: all ? ['on_roadmap'] : ['fix_ready', 'fixed', 'wont_fix', 'duplicate', 'exists', 'on_roadmap'] } },
    orderBy: [{ assignedAt: 'asc' }, { number: 'asc' }], take: 50, select: { id: true },
  });
  const reports = await Promise.all(rows.map(async ({ id }) => devView((await loadReport(id))!)));
  return NextResponse.json({ reports });
}
