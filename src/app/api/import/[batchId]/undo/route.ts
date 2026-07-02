export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest, { params }: { params: { batchId: string } }) {
  const session = await getServerSession(authOptions);
  const tenantId = (session as any)?.tenantId;
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const batch = await prisma.importBatch.findUnique({ where: { id: params.batchId } });
  if (!batch || batch.tenantId !== tenantId) {
    return NextResponse.json({ error: 'Import batch not found' }, { status: 404 });
  }
  if (batch.undoneAt) {
    return NextResponse.json({ error: 'This import has already been undone' }, { status: 400 });
  }
  if (new Date() > batch.canUndoUntil) {
    return NextResponse.json({ error: 'The 24-hour undo window has expired' }, { status: 400 });
  }

  // Delete events created by this batch first (due to FK on clientId)
  const { count: eventsDeleted } = await prisma.event.deleteMany({
    where: { tenantId, importBatchId: params.batchId },
  });

  // Delete clients created by this batch (only newly created ones have importBatchId set)
  const { count: clientsDeleted } = await prisma.client.deleteMany({
    where: { tenantId, importBatchId: params.batchId },
  });

  await prisma.importBatch.update({
    where: { id: params.batchId },
    data: { undoneAt: new Date() },
  });

  return NextResponse.json({ undone: true, eventsDeleted, clientsDeleted });
}
