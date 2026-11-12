// Server helpers for bug reports and suggestions: who is asking, and what each side may see
import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import type { ReportAttachment } from './options';

export type ReportViewer = { userId: string; tenantId: string | null; isAdmin: boolean };

// Any signed-in user. isAdmin is checked against the database, not only the session token.
export async function reportViewer(): Promise<ReportViewer | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.userId) return NextResponse.json({ error: 'Sign in to send a report' }, { status: 401 });
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
};

type FullReport = NonNullable<Awaited<ReturnType<typeof loadReport>>>;

export function loadReport(id: string) {
  return prisma.feedbackReport.findUnique({ where: { id }, include: reportInclude });
}

export const attachmentsOf = (v: unknown): ReportAttachment[] => (Array.isArray(v) ? (v as ReportAttachment[]) : []);

// asAdmin: Super Admin triage view (reporter identity, captured context, internal notes, priority).
// Otherwise the reporter's own view: no internal notes, no priority.
export function reportView(r: FullReport, asAdmin: boolean) {
  const notes = r.notes
    .filter(n => asAdmin || !n.internal)
    .map(n => ({ id: n.id, body: n.body, fromAdmin: n.fromAdmin, internal: n.internal, author: n.fromAdmin && !asAdmin ? 'Booth Genius' : (n.author?.name ?? ''), createdAt: n.createdAt }));
  const base = {
    id: r.id, number: r.number, type: r.type, title: r.title, area: r.area, severity: r.severity, deviceInfo: r.deviceInfo,
    details: r.details, status: r.status, fixedInVersion: r.fixedInVersion, createdAt: r.createdAt, updatedAt: r.updatedAt,
    attachments: attachmentsOf(r.attachments).map((a, i) => ({ index: i, name: a.name, contentType: a.contentType, bytes: a.bytes, url: `/api/reports/${r.id}/files/${i}` })),
    notes,
  };
  if (!asAdmin) return { ...base, unread: r.reporterUnread };
  return {
    ...base, priority: r.priority, unread: r.adminUnread,
    reporter: r.user, tenant: r.tenant, pageUrl: r.pageUrl, userAgent: r.userAgent, appVersion: r.appVersion,
  };
}

export const forEmail = (r: FullReport) => ({ id: r.id, number: r.number, type: r.type, title: r.title, area: r.area, details: r.details, user: r.user, tenant: r.tenant });
