export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const c = await prisma.contract.findFirst({ where: { id: params.id, tenantId: session.tenantId }, include: { client: true, event: true } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(c);
}
