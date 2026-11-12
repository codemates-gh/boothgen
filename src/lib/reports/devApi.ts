// "Assign to Dev": the Dev API lets a Claude Code session read reports assigned to Dev and update them
// (status, fixed in version, notes) with the same effects as Super Admin triage. Off unless REPORTS_DEV_TOKEN is
// set (32+ characters); requests send it as "Authorization: Bearer <token>". See docs/REPORTS-DEV.md.
import { createHash, timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { getPresignedDownloadUrl } from '@/lib/storage/r2';
import { attachmentsOf, loadReport, reportView, type FullReport } from './server';

const digest = (s: string) => createHash('sha256').update(s).digest();

export function devAuthorized(req: NextRequest): NextResponse | null {
  const token = process.env.REPORTS_DEV_TOKEN ?? '';
  if (token.length < 32) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const sent = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!sent || !timingSafeEqual(digest(sent), digest(token))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

// "12", "#12" or a report id
export async function findReport(ref: string): Promise<FullReport | null> {
  const n = /^#?\d+$/.test(ref) ? Number(ref.replace('#', '')) : null;
  const row = n ? await prisma.feedbackReport.findUnique({ where: { number: n }, select: { id: true } }) : { id: ref };
  return row ? loadReport(row.id) : null;
}

// Everything needed to work on a report, without people's email addresses; attachments as 1-hour download links
export async function devView(r: FullReport) {
  const v = reportView(r, '', true) as ReturnType<typeof reportView> & Record<string, any>;
  const keys = attachmentsOf(r.attachments);
  return {
    ...v,
    assignedToDev: r.assignedToDev, assignedAt: r.assignedAt,
    reporter: { name: v.reporterName },
    followers: r.followers.map(f => ({ name: f.user.name || 'a tester', voted: f.voted })),
    tenant: r.tenant ? { name: r.tenant.name } : null,
    link: `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com').replace(/\/$/, '')}/super-admin?tab=reports&report=${r.id}`,
    attachments: await Promise.all(v.attachments.map(async (a: any, i: number) => ({ ...a, url: await getPresignedDownloadUrl(keys[i].key, 3600) }))),
    isMine: undefined, hasVoted: undefined, isFollowing: undefined, canVote: undefined, canReply: undefined, unread: undefined,
  };
}
