export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { checkRateLimit } from '@/lib/rate-limit';
import { forEmail, loadReport, reportView, reportViewer, watchersOf } from '@/lib/reports/server';
import { notifyAdminsReply, notifyWatchers } from '@/lib/reports/notify';

const Body = z.object({
  body: z.string().trim().min(1, 'Write a note').max(5000),
  admin: z.boolean().optional(),      // posted from Super Admin triage
  internal: z.boolean().optional(),   // Super Admin only: hidden from everyone else
}).strict();

// A note: from a Super Admin (visible to everyone unless internal; reporter and followers are emailed),
// or a reply from the reporter or a follower (Booth Genius is emailed; the other watchers get it too)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!checkRateLimit('report-note:' + viewer.userId, 60, 3600_000).success) return NextResponse.json({ error: 'Too many notes, try again later' }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Write a note' }, { status: 400 });
  const r = await loadReport(params.id);
  if (!r) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  const asAdmin = viewer.isAdmin && parsed.data.admin === true;
  const watcher = r.userId === viewer.userId || r.followers.some(f => f.userId === viewer.userId);
  if (!asAdmin && !watcher) return NextResponse.json({ error: 'Vote or tap "This is my issue too" to join this report first' }, { status: 403 });
  const internal = asAdmin && parsed.data.internal === true;

  await prisma.$transaction([
    prisma.feedbackNote.create({ data: { reportId: r.id, authorId: viewer.userId, fromAdmin: asAdmin, internal, body: parsed.data.body } }),
    ...(internal ? [] : [
      prisma.feedbackReport.update({
        where: { id: r.id },
        data: { ...(asAdmin ? {} : { adminUnread: true }), ...(r.userId !== viewer.userId ? { reporterUnread: true } : {}) },
      }),
      prisma.feedbackFollower.updateMany({ where: { reportId: r.id, following: true, userId: { not: viewer.userId } }, data: { unread: true } }),
    ]),
  ]);
  if (!internal) {
    const me = asAdmin ? null : (r.userId === viewer.userId ? r.user.email : r.followers.find(f => f.userId === viewer.userId)?.user.email);
    const others = watchersOf(r).filter(e => e !== me);
    if (others.length) await notifyWatchers(forEmail(r), others, { note: parsed.data.body });
    if (!asAdmin) await notifyAdminsReply({ ...forEmail(r), user: { name: r.user.id === viewer.userId ? r.user.name : (r.followers.find(f => f.userId === viewer.userId)?.user.name ?? ''), email: me ?? '' } }, parsed.data.body);
  }
  const updated = await loadReport(r.id);
  return NextResponse.json({ report: reportView(updated!, viewer.userId, asAdmin) }, { status: 201 });
}
