export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { closedForClients } from '@/lib/genius';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { reason, portalToken } = await req.json();
  const quote = await prisma.quote.findFirst({ where: { id: params.id }, include: { event: true } });
  if (!quote || quote.event.portalToken !== portalToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  { const closed = await closedForClients(quote.tenantId); if (closed) return closed; } // Genie-only account: CRM is closed
  await prisma.quote.update({ where: { id: params.id }, data: { status: 'DECLINED', declinedAt: new Date(), declineReason: reason || null } });
  return NextResponse.json({ success: true });
}
