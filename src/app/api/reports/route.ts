export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { headR2Object } from '@/lib/storage/r2';
import { APP_VERSION } from '@/lib/version';
import { checkRateLimit } from '@/lib/rate-limit';
import { displayName, forEmail, loadReport, reportViewer } from '@/lib/reports/server';
import { notifyAdminsNewReport } from '@/lib/reports/notify';
import { AREA_VALUES, ATTACHMENT_MAX_FILES, ATTACHMENT_TYPES, OPEN_STATUSES, SEVERITY_VALUES, TYPE_VALUES } from '@/lib/reports/options';

const Attachment = z.object({
  key: z.string().max(200),
  name: z.string().trim().min(1).max(200),
  contentType: z.string().refine(t => t in ATTACHMENT_TYPES),
  bytes: z.number().int().min(1),
}).strict();

const Body = z.object({
  type: z.enum(TYPE_VALUES),
  title: z.string().trim().min(3, 'Add a short title').max(140),
  area: z.enum(AREA_VALUES),
  severity: z.enum(SEVERITY_VALUES).nullish(),
  deviceInfo: z.string().trim().max(200).nullish(),
  details: z.string().trim().min(5, 'Add a few details').max(10000),
  pageUrl: z.string().max(1000).nullish(),
  attachments: z.array(Attachment).max(ATTACHMENT_MAX_FILES, `Attach up to ${ATTACHMENT_MAX_FILES} files`).default([]),
}).strict();

// The shared Reports board: every report from every account (reporter by display name only).
// ?status=open (default) | all | <status>, &type, &area, &q, &mine=1 (reported or followed by me)
export async function GET(req: NextRequest) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  const p = req.nextUrl.searchParams;
  const status = p.get('status') || 'open';
  const q = p.get('q')?.trim();
  const where: Prisma.FeedbackReportWhereInput = {
    ...(status === 'open' ? { status: { in: OPEN_STATUSES } } : status === 'all' ? {} : { status }),
    ...(p.get('type') ? { type: p.get('type')! } : {}),
    ...(p.get('area') ? { area: p.get('area')! } : {}),
    ...(p.get('mine') === '1' ? { OR: [{ userId: viewer.userId }, { followers: { some: { userId: viewer.userId } } }] } : {}),
    ...(q ? { AND: [{ OR: [
      { title: { contains: q, mode: 'insensitive' } },
      { details: { contains: q, mode: 'insensitive' } },
      ...(/^#?\d+$/.test(q) ? [{ number: Number(q.replace('#', '')) }] : []),
    ] }] } : {}),
  };
  const reports = await prisma.feedbackReport.findMany({
    where, orderBy: { updatedAt: 'desc' }, take: 300,
    select: {
      id: true, number: true, type: true, title: true, area: true, severity: true, status: true, priority: true, fixedInVersion: true,
      userId: true, reporterUnread: true, createdAt: true, updatedAt: true,
      user: { select: { name: true } },
      followers: { select: { userId: true, unread: true } },
    },
  });
  return NextResponse.json({
    reports: reports.map(({ userId, reporterUnread, user, followers, ...r }) => {
      const mine = userId === viewer.userId;
      const follow = followers.find(f => f.userId === viewer.userId);
      return { ...r, reporterName: displayName(user.name), followerCount: followers.length, isMine: mine, isFollowing: !!follow, unread: mine ? reporterUnread : !!follow?.unread };
    }),
  });
}

// File a bug report or suggestion. Who, which account, page, browser and BoothGen version are captured here.
export async function POST(req: NextRequest) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  if (!checkRateLimit('report:' + viewer.userId, 20, 3600_000).success) return NextResponse.json({ error: 'Too many reports in the last hour, try again later' }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the form' }, { status: 400 });
  const d = parsed.data;

  for (const a of d.attachments) {
    if (!a.key.startsWith(`reports/${viewer.userId}/`)) return NextResponse.json({ error: 'Attachment not found' }, { status: 400 });
    const head = await headR2Object(a.key);
    if (!head) return NextResponse.json({ error: `"${a.name}" didn't finish uploading. Remove it and try again.` }, { status: 400 });
    a.bytes = head.bytes;
  }

  const created = await prisma.feedbackReport.create({
    data: {
      userId: viewer.userId, tenantId: viewer.tenantId,
      type: d.type, title: d.title, area: d.area, severity: d.type === 'bug' ? (d.severity ?? null) : null,
      deviceInfo: d.deviceInfo || null, details: d.details, attachments: d.attachments,
      pageUrl: d.pageUrl || req.headers.get('referer') || null,
      userAgent: req.headers.get('user-agent')?.slice(0, 500) ?? null,
      appVersion: APP_VERSION,
    },
  });
  const full = await loadReport(created.id);
  await notifyAdminsNewReport(forEmail(full!));
  return NextResponse.json({ id: created.id, number: created.number }, { status: 201 });
}
