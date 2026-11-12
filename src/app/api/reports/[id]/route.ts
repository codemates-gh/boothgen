export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { forEmail, loadReport, markReadFor, reportView, reportViewer, watchersOf } from '@/lib/reports/server';
import { notifyWatchers } from '@/lib/reports/notify';
import { REPORT_PRIORITIES, STATUS_VALUES, statusLabel } from '@/lib/reports/options';

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

const Link = z.string().trim().max(500).refine(u => u.startsWith('/') || /^https?:\/\//i.test(u), 'The link must start with / or https://');

const Triage = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  priority: z.enum(REPORT_PRIORITIES).nullable().optional(),
  fixedInVersion: z.string().trim().max(40).nullable().optional(),
  howToFind: z.string().trim().max(2000).nullable().optional(),   // required with status "exists"
  howToFindUrl: z.union([Link, z.literal('')]).nullable().optional(),
  duplicateOf: z.coerce.number().int().positive().optional(),       // report number; required with status "duplicate"
}).strict();

// Super Admin triage. Reporter and followers are told about status / version changes. "Already exists" needs
// the steps to find the feature; "Duplicate" needs the original, and moves the reporter and followers there.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAdmin) return NextResponse.json({ error: 'Super Admins only' }, { status: 403 });
  const parsed = Triage.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid change' }, { status: 400 });
  const r = await loadReport(params.id);
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  const d = parsed.data;
  const newStatus = d.status ?? r.status;
  const statusChanged = newStatus !== r.status;

  const howToFind = d.howToFind === undefined ? r.howToFind : (d.howToFind || null);
  const howToFindUrl = d.howToFindUrl === undefined ? r.howToFindUrl : (d.howToFindUrl || null);
  if (newStatus === 'exists' && !howToFind) return NextResponse.json({ error: 'Add how to find it' }, { status: 400 });

  let original: { id: string; number: number; userId: string } | null = null;
  if (newStatus === 'duplicate' && (statusChanged || d.duplicateOf)) {
    if (!d.duplicateOf) return NextResponse.json({ error: 'Enter the number of the original report' }, { status: 400 });
    original = await prisma.feedbackReport.findUnique({ where: { number: d.duplicateOf }, select: { id: true, number: true, userId: true } });
    if (!original || original.id === r.id) return NextResponse.json({ error: `Report #${d.duplicateOf} wasn't found` }, { status: 400 });
  }

  const fixedIn = d.fixedInVersion === undefined ? r.fixedInVersion : (d.fixedInVersion || null);
  const versionChanged = fixedIn !== r.fixedInVersion;
  const howChanged = newStatus === 'exists' && (howToFind !== r.howToFind || howToFindUrl !== r.howToFindUrl);
  const tellWatchers = statusChanged || versionChanged || howChanged || !!original;

  const noteBody = newStatus === 'duplicate' && original ? `Marked as a duplicate of #${original.number}`
    : statusChanged ? `Status changed to ${statusLabel(newStatus)}${newStatus === 'fixed' && fixedIn ? ` (version ${fixedIn})` : ''}`
    : howChanged ? 'Updated how to find it'
    : `Fixed in version ${fixedIn ?? '—'}`;

  // Duplicate: the reporter's and voters' votes and follows move to the original (one per person; the original's
  // reporter already counts). The reporter of the duplicate votes for and follows the original.
  const movers = original
    ? [{ userId: r.userId, voted: true, following: true }, ...r.followers.map(f => ({ userId: f.userId, voted: f.voted, following: f.following }))]
        .filter(m => m.userId !== original!.userId)
    : [];

  await prisma.$transaction([
    prisma.feedbackReport.update({
      where: { id: r.id },
      data: {
        status: newStatus,
        ...(d.priority !== undefined ? { priority: d.priority } : {}),
        fixedInVersion: fixedIn, howToFind, howToFindUrl,
        duplicateOfId: newStatus === 'duplicate' ? (original?.id ?? r.duplicateOfId) : null,
        ...(tellWatchers ? { reporterUnread: true } : {}),
      },
    }),
    ...(tellWatchers ? [
      prisma.feedbackFollower.updateMany({ where: { reportId: r.id, following: true }, data: { unread: true } }),
      prisma.feedbackNote.create({ data: { reportId: r.id, authorId: viewer.userId, fromAdmin: true, body: noteBody } }),
    ] : []),
    ...(original ? [
      ...movers.map(m => prisma.feedbackFollower.upsert({
        where: { reportId_userId: { reportId: original!.id, userId: m.userId } },
        create: { reportId: original!.id, userId: m.userId, voted: m.voted, following: m.following },
        update: { ...(m.voted ? { voted: true } : {}), ...(m.following ? { following: true } : {}) },
      })),
      // The duplicate keeps no votes of its own: they now count on the original
      prisma.feedbackFollower.updateMany({ where: { reportId: r.id }, data: { voted: false } }),
      prisma.feedbackReport.update({ where: { id: original.id }, data: { adminUnread: true }, select: { id: true } }),
    ] : []),
  ]);
  if (tellWatchers) {
    await notifyWatchers(forEmail(r), watchersOf(r), {
      status: newStatus, fixedInVersion: fixedIn, howToFind, howToFindUrl, duplicateOf: original?.number ?? null,
      ...(howChanged && !statusChanged ? { note: 'How to find it was updated.' } : {}),
    });
  }
  const updated = await loadReport(r.id);
  return NextResponse.json({ report: reportView(updated!, viewer.userId, true) });
}
