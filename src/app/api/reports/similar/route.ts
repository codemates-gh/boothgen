export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { reportViewer, voteCount, votingOpen } from '@/lib/reports/server';
import { OPEN_STATUSES } from '@/lib/reports/options';

const STOP = new Set(['the', 'and', 'for', 'with', 'when', 'not', 'does', 'doesnt', "doesn't", 'can', 'cant', "can't", 'after', 'from', 'that', 'this', 'into', 'have', 'are', 'was', 'its', "it's"]);

// Existing reports that look like the one being typed (title words matched against titles and details),
// so people can say "This is my issue too" instead of filing a duplicate. Open reports first.
export async function GET(req: NextRequest) {
  const viewer = await reportViewer();
  if (viewer instanceof NextResponse) return viewer;
  const words = (req.nextUrl.searchParams.get('q') ?? '').toLowerCase().split(/[^\p{L}\p{N}']+/u)
    .filter(w => w.length >= 3 && !STOP.has(w)).slice(0, 8);
  if (words.length === 0) return NextResponse.json({ reports: [] });
  const rows = await prisma.feedbackReport.findMany({
    where: { duplicateOfId: null, OR: words.flatMap(w => [{ title: { contains: w, mode: 'insensitive' as const } }, { details: { contains: w, mode: 'insensitive' as const } }]) },
    orderBy: { updatedAt: 'desc' }, take: 50,
    select: { id: true, number: true, type: true, title: true, details: true, status: true, userId: true, followers: { select: { userId: true, voted: true } } },
  });
  const scored = rows.map(r => {
    const t = r.title.toLowerCase(), d = r.details.toLowerCase();
    const score = words.reduce((s, w) => s + (t.includes(w) ? 3 : d.includes(w) ? 1 : 0), 0) + (OPEN_STATUSES.includes(r.status) ? 2 : 0);
    return { r, score };
  }).filter(x => x.score >= 3).sort((a, b) => b.score - a.score).slice(0, 5);
  return NextResponse.json({
    reports: scored.map(({ r }) => ({
      id: r.id, number: r.number, type: r.type, title: r.title, status: r.status, voteCount: voteCount(r.followers),
      isMine: r.userId === viewer.userId, hasVoted: r.followers.some(f => f.userId === viewer.userId && f.voted),
      canVote: r.userId !== viewer.userId && votingOpen(r.status),
    })),
  });
}
