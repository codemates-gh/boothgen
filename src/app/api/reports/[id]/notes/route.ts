export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { checkRateLimit } from '@/lib/rate-limit';
import { forEmail, loadReport, reportView, reportViewer } from '@/lib/reports/server';
import { notifyAdminsReply, notifyReporter } from '@/lib/reports/notify';

const Body = z.object({
  body: z.string().trim().min(1, 'Write a note').max(5000),
  admin: z.boolean().optional(),      // posted from Super Admin triage
  internal: z.boolean().optional(),   // Super Admin only: hidden from the reporter
}).strict();

// A note on a report: a Super Admin note (visible to the reporter unless internal), or the reporter's reply
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!checkRateLimit('report-note:' + viewer.userId, 60, 3600_000).success) return NextResponse.json({ error: 'Too many notes, try again later' }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Write a note' }, { status: 400 });
  const r = await loadReport(params.id);
  const asAdmin = viewer.isAdmin && parsed.data.admin === true;
  if (!r || (!asAdmin && r.userId !== viewer.userId)) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  const internal = asAdmin && parsed.data.internal === true;

  await prisma.$transaction([
    prisma.feedbackNote.create({ data: { reportId: r.id, authorId: viewer.userId, fromAdmin: asAdmin, internal, body: parsed.data.body } }),
    prisma.feedbackReport.update({
      where: { id: r.id },
      data: asAdmin ? (internal ? {} : { reporterUnread: true }) : { adminUnread: true },
    }),
  ]);
  if (asAdmin && !internal) await notifyReporter(forEmail(r), { note: parsed.data.body });
  if (!asAdmin) await notifyAdminsReply(forEmail(r), parsed.data.body);
  const updated = await loadReport(r.id);
  return NextResponse.json({ report: reportView(updated!, asAdmin) }, { status: 201 });
}
