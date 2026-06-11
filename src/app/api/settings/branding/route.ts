export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const b = await prisma.tenantBranding.findUnique({ where: { tenantId: session.tenantId } });
  return NextResponse.json(b ?? {});
}
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const b = await prisma.tenantBranding.upsert({ where: { tenantId: session.tenantId }, update: body, create: { tenantId: session.tenantId, ...body } });
  return NextResponse.json(b);
}
