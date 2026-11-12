// Server helpers for bug reports and suggestions: who is asking, and what each side may see.
// Every signed-in user sees every report (to avoid duplicates); reporter email, account, page, browser and
// internal notes are Super Admin only.
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { OPEN_STATUSES, type ReportAttachment } from './options';

export type ReportViewer = { userId: string; tenantId: string | null; isAdmin: boolean };

// Any signed-in user. isAdmin is checked against the database, not only the session token.
export async function reportViewer(): Promise<ReportViewer | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.userId) return NextResponse.json({ error: 'Sign in to see reports' }, { status: 401 });
  let isAdmin = false;
  if (session.globalRole === 'SUPER_ADMIN') {
    const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { globalRole: true } });
    isAdmin = u?.globalRole === 'SUPER_ADMIN';
  }
  return { userId: session.userId, tenantId: session.tenantId ?? null, isAdmin };
}

export const reportInclude = {
  user: { select: { id: true, name: true, email: true } },
  tenant: { select: { id: true, name: true, slug: true } },
  notes: { orderBy: { createdAt: 'asc' as const }, include: { author: { select: { name: true } } } },
  followers: { select: { userId: true, voted: true, following: true, unread: true, user: { select: { name: true, email: true } } } },
  duplicateOf: { select: { id: true, number: true, title: true } },
};

export type FullReport = NonNullable<Awaited<ReturnType<typeof loadReport>>>;

export function loadReport(id: string) {
  return prisma.feedbackReport.findUnique({ where: { id }, include: reportInclude });
}

export const attachmentsOf = (v: unknown): ReportAttachment[] => (Array.isArray(v) ? (v as ReportAttachment[]) : []);
export const displayName = (name: string | null | undefined) => name?.trim() || 'a tester';

// Votes (suggestions) / people affected (bugs): the reporter plus everyone who voted
export const voteCount = (followers: { voted: boolean }[]) => 1 + followers.filter(f => f.voted).length;
// Voting is open until the report is closed (Fixed, Won't fix, Duplicate, Already exists)
export const votingOpen = (status: string) => OPEN_STATUSES.includes(status);

// asAdmin: Super Admin triage view (reporter email, account, captured context, internal notes, followers' emails).
// Otherwise the shared board view: reporter by display name only, no internal notes.
export function reportView(r: FullReport, viewerId: string, asAdmin: boolean) {
  const isMine = r.userId === viewerId;
  const follow = r.followers.find(f => f.userId === viewerId);
  const notes = r.notes
    .filter(n => asAdmin || !n.internal)
    .map(n => ({
      id: n.id, body: n.body, fromAdmin: n.fromAdmin, internal: n.internal, createdAt: n.createdAt,
      attachments: attachmentsOf(n.attachments).map((a, i) => ({ index: i, name: a.name, contentType: a.contentType, bytes: a.bytes, url: `/api/reports/${r.id}/notes/${n.id}/files/${i}` })),
      author: n.fromAdmin && !asAdmin ? 'Booth Genius' : n.fromAdmin && !n.authorId ? 'Dev' : displayName(n.author?.name),
    }));
  const base = {
    id: r.id, number: r.number, type: r.type, title: r.title, area: r.area, severity: r.severity, deviceInfo: r.deviceInfo,
    details: r.details, status: r.status, priority: r.priority, fixedInVersion: r.fixedInVersion,
    howToFind: r.howToFind, howToFindUrl: r.howToFindUrl, duplicateOf: r.duplicateOf,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
    reporterName: displayName(r.user.name), voteCount: voteCount(r.followers),
    isMine, hasVoted: isMine || !!follow?.voted, isFollowing: isMine || !!follow?.following,
    canVote: !isMine && votingOpen(r.status), canReply: isMine || !!follow,
    attachments: attachmentsOf(r.attachments).map((a, i) => ({ index: i, name: a.name, contentType: a.contentType, bytes: a.bytes, url: `/api/reports/${r.id}/files/${i}` })),
    notes,
  };
  if (!asAdmin) return { ...base, unread: isMine ? r.reporterUnread : !!(follow?.following && follow.unread) };
  return {
    ...base, unread: r.adminUnread, assignedToDev: r.assignedToDev,
    reporter: r.user, tenant: r.tenant, pageUrl: r.pageUrl, userAgent: r.userAgent, appVersion: r.appVersion,
    followers: r.followers.map(f => ({ ...f.user, voted: f.voted, following: f.following })),
  };
}

// Clears the viewer's own unread marker (as reporter or follower)
export async function markReadFor(r: FullReport, userId: string) {
  if (r.userId === userId && r.reporterUnread) await prisma.feedbackReport.update({ where: { id: r.id }, data: { reporterUnread: false }, select: { id: true } });
  if (r.followers.some(f => f.userId === userId && f.unread)) await prisma.feedbackFollower.update({ where: { reportId_userId: { reportId: r.id, userId } }, data: { unread: false } });
}

// Reporter and followers: everyone who gets status / note updates
export const watchersOf = (r: FullReport) => [r.user.email, ...r.followers.filter(f => f.following).map(f => f.user.email)];

export const forEmail = (r: FullReport) => ({ id: r.id, number: r.number, type: r.type, title: r.title, area: r.area, details: r.details, user: r.user, tenant: r.tenant });
