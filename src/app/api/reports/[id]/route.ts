export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { forEmail, loadReport, reportView, reportViewer } from '@/lib/reports/server';
import { notifyReporter } from '@/lib/reports/notify';
import { REPORT_PRIORITIES, STATUS_VALUES, statusLabel } from '@/lib/reports/options';

type Ctx = { params: { id: string } };

// One report. The reporter sees their own (no internal notes); Super Admins see everything with ?admin=1.
// Opening it clears that side's unread marker.
export async function GET(req: NextRequest, { params }: Ctx) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  const r = await loadReport(params.id);
  const asAdmin = viewer.isAdmin && req.nextUrl.searchParams.get('admin') === '1';
  if (!r || (!asAdmin && r.userId !== viewer.userId)) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  if (asAdmin && r.adminUnread) await prisma.feedbackReport.update({ where: { id: r.id }, data: { adminUnread: false }, select: { id: true } });
  if (!asAdmin && r.reporterUnread) await prisma.feedbackReport.update({ where: { id: r.id }, data: { reporterUnread: false }, select: { id: true } });
  return NextResponse.json({ report: reportView(r, asAdmin) });
}

const Triage = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  priority: z.enum(REPORT_PRIORITIES).nullable().optional(),
  fixedInVersion: z.string().trim().max(40).nullable().optional(),
}).strict();

// Super Admin triage: status, priority, "fixed in version". The reporter is told about status / version changes.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Super Admins only' }, { status: 403 });
  const parsed = Triage.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid change' }, { status: 400 });
  const r = await loadReport(params.id);
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  const d = parsed.data;
  const fixedIn = d.fixedInVersion === undefined ? r.fixedInVersion : (d.fixedInVersion || null);
  const statusChanged = d.status !== undefined && d.status !== r.status;
  const versionChanged = fixedIn !== r.fixedInVersion;
  const tellReporter = statusChanged || versionChanged;
  const newStatus = d.status ?? r.status;

  await prisma.$transaction([
    prisma.feedbackReport.update({
      where: { id: r.id },
      data: {
        ...(d.status !== undefined ? { status: d.status } : {}),
        ...(d.priority !== undefined ? { priority: d.priority } : {}),
        fixedInVersion: fixedIn,
        ...(tellReporter ? { reporterUnread: true } : {}),
      },
    }),
    ...(tellReporter ? [prisma.feedbackNote.create({
      data: {
        reportId: r.id, authorId: viewer.userId, fromAdmin: true,
        body: statusChanged
          ? `Status changed to ${statusLabel(newStatus)}${newStatus === 'fixed' && fixedIn ? ` (version ${fixedIn})` : ''}`
          : `Fixed in version ${fixedIn ?? '—'}`,
      },
    })] : []),
  ]);
  if (tellReporter) await notifyReporter(forEmail(r), { status: newStatus, fixedInVersion: fixedIn });
  const updated = await loadReport(r.id);
  return NextResponse.json({ report: reportView(updated!, true) });
}
