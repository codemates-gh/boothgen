export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

// Marks an automated email skipped from the event page; the scheduled send checks the status first and does nothing
const SKIPPED_FROM_EVENT = 'Skipped from the event page';

// Skip one scheduled automated email for this event, or undo the skip while it's still in the future.
// Body: { action: 'skip' | 'restore' }
export async function POST(req: NextRequest, props: { params: Promise<{ id: string; executionId: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { action } = await req.json().catch(() => ({}));
  if (action !== 'skip' && action !== 'restore') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  const ex = await prisma.automationExecution.findFirst({
    where: { id: params.executionId, eventId: params.id, tenantId: session.tenantId },
    select: { id: true, status: true, scheduledFor: true, errorMessage: true },
  });
  if (!ex) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'skip') {
    if (ex.status !== 'SCHEDULED') return NextResponse.json({ error: 'This email has already gone out or was skipped' }, { status: 409 });
    // Only flips a still-scheduled row, so a send that started meanwhile isn't touched
    const r = await prisma.automationExecution.updateMany({ where: { id: ex.id, status: 'SCHEDULED' }, data: { status: 'SKIPPED', errorMessage: SKIPPED_FROM_EVENT } });
    if (!r.count) return NextResponse.json({ error: 'This email has already gone out' }, { status: 409 });
  } else {
    if (ex.status !== 'SKIPPED' || ex.errorMessage !== SKIPPED_FROM_EVENT) return NextResponse.json({ error: 'Only an email you skipped can be brought back' }, { status: 409 });
    if (ex.scheduledFor <= new Date()) return NextResponse.json({ error: 'Its send time has passed, so it can\'t be brought back' }, { status: 409 });
    await prisma.automationExecution.update({ where: { id: ex.id }, data: { status: 'SCHEDULED', errorMessage: null } });
  }
  return NextResponse.json({ ok: true });
}
