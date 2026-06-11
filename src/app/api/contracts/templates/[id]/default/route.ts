export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.contractTemplate.updateMany({ where: { tenantId: session.tenantId }, data: { isDefault: false } });
  await prisma.contractTemplate.update({ where: { id: params.id }, data: { isDefault: true } });
  return NextResponse.json({ success: true });
}
