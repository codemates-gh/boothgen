export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { devAuthorized, devView } from '@/lib/reports/devApi';
import { loadReport } from '@/lib/reports/server';

// Reports assigned to Dev, oldest assignment first (?all=1 also includes closed ones still assigned)
export async function GET(req: NextRequest) {
  const denied = devAuthorized(req);
  if (denied) return denied;
  const all = req.nextUrl.searchParams.get('all') === '1';
  const rows = await prisma.feedbackReport.findMany({
    where: { assignedToDev: true, ...(all ? {} : { status: { notIn: ['fixed', 'wont_fix', 'duplicate', 'exists'] } }) },
    orderBy: [{ assignedAt: 'asc' }, { number: 'asc' }], take: 50, select: { id: true },
  });
  const reports = await Promise.all(rows.map(async ({ id }) => devView((await loadReport(id))!)));
  return NextResponse.json({ reports });
}
