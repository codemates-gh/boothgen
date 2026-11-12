export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma/client';
import { reportViewer } from '@/lib/reports/server';

// Super Admin triage list: every report, filtered, with counts per status
export async function GET(req: NextRequest) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Super Admins only' }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const q = p.get('q')?.trim();
  const base: Prisma.FeedbackReportWhereInput = {
    ...(p.get('type') ? { type: p.get('type')! } : {}),
    ...(p.get('area') ? { area: p.get('area')! } : {}),
    ...(p.get('tenantId') ? { tenantId: p.get('tenantId')! } : {}),
    ...(p.get('unread') === '1' ? { adminUnread: true } : {}),
    ...(q ? {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { details: { contains: q, mode: 'insensitive' } },
        { user: { email: { contains: q, mode: 'insensitive' } } },
        { user: { name: { contains: q, mode: 'insensitive' } } },
        ...(/^#?\d+$/.test(q) ? [{ number: Number(q.replace('#', '')) }] : []),
      ],
    } : {}),
  };
  const where = { ...base, ...(p.get('status') ? { status: p.get('status')! } : {}) };
  const [reports, byStatus, tenants] = await Promise.all([
    prisma.feedbackReport.findMany({
      where, orderBy: [{ adminUnread: 'desc' }, { updatedAt: 'desc' }], take: 300,
      select: {
        id: true, number: true, type: true, title: true, area: true, severity: true, status: true, priority: true, adminUnread: true, createdAt: true, updatedAt: true,
        user: { select: { name: true, email: true } }, tenant: { select: { id: true, name: true } },
        _count: { select: { followers: true } },
      },
    }),
    prisma.feedbackReport.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
    prisma.tenant.findMany({ where: { feedbackReports: { some: {} } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return NextResponse.json({
    reports: reports.map(({ adminUnread, _count, ...r }) => ({ ...r, unread: adminUnread, followerCount: _count.followers })),
    counts: Object.fromEntries(byStatus.map(s => [s.status, s._count._all])),
    tenants,
  });
}
