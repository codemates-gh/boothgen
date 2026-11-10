export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { inngest } from '@/lib/inngest/client';
import { requireGenieAdmin } from '@/lib/genie/admin';

// Sends a failed text/email again. Only a failed share can be resent, and the status flip is atomic, so a double
// click (or two admins) queues one send. Each attempt gets its own Inngest event id.
export async function POST(_req: NextRequest, { params }: { params: { id: string; shareId: string } }) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const share = await prisma.genieShare.findFirst({ where: { id: params.shareId, eventId: params.id, tenantId: auth.tenantId }, select: { id: true } });
  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const claimed = await prisma.genieShare.updateMany({
    where: { id: share.id, status: 'failed' },
    data: { status: 'queued', error: null, attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return NextResponse.json({ error: 'Only failed messages can be resent.', code: 'not_failed' }, { status: 409 });

  const { attempts } = await prisma.genieShare.findUniqueOrThrow({ where: { id: share.id }, select: { attempts: true } });
  try {
    await inngest.send({ id: `genie-share-${share.id}-${attempts}`, name: 'genie/share.send', data: { shareId: share.id } });
  } catch (err) {
    await prisma.genieShare.updateMany({ where: { id: share.id, status: 'queued' }, data: { status: 'failed', error: 'Could not queue the resend. Try again.' } });
    return NextResponse.json({ error: 'Could not queue the resend. Try again.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, status: 'queued', attempts });
}
