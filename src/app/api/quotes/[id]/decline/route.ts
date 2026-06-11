export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { reason, portalToken } = await req.json();
  const quote = await prisma.quote.findFirst({ where: { id: params.id }, include: { event: true } });
  if (!quote || quote.event.portalToken !== portalToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.quote.update({ where: { id: params.id }, data: { status: 'DECLINED', declinedAt: new Date(), declineReason: reason || null } });
  return NextResponse.json({ success: true });
}
