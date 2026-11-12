export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { loadReport, markReadFor, reportView, reportViewer } from '@/lib/reports/server';
import { Triage, applyTriage } from '@/lib/reports/triage';

type Ctx = { params: { id: string } };

// One report, for any signed-in user (shared board). Super Admins get the triage view with ?admin=1.
// Opening it clears the viewer's own unread marker (Super Admin, reporter or follower).
export async function GET(req: NextRequest, { params }: Ctx) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  const r = await loadReport(params.id);
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  const asAdmin = viewer.isAdmin && req.nextUrl.searchParams.get('admin') === '1';
  if (asAdmin && r.adminUnread) await prisma.feedbackReport.update({ where: { id: r.id }, data: { adminUnread: false }, select: { id: true } });
  if (!asAdmin) await markReadFor(r, viewer.userId);
  return NextResponse.json({ report: reportView(r, viewer.userId, asAdmin) });
}

// Super Admin triage (see applyTriage)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Super Admins only' }, { status: 403 });
  const parsed = Triage.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid change' }, { status: 400 });
  const r = await loadReport(params.id);
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  const result = await applyTriage(r, viewer.userId, parsed.data);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  const updated = await loadReport(r.id);
  return NextResponse.json({ report: reportView(updated!, viewer.userId, true) });
}
