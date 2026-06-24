export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const dates = await prisma.blackoutDate.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { date: 'asc' },
  });
  return NextResponse.json(dates.map(d => d.date.toISOString().slice(0, 10)));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { date } = await req.json();
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
  await prisma.blackoutDate.upsert({
    where: { tenantId_date: { tenantId: session.tenantId, date: new Date(date) } },
    create: { tenantId: session.tenantId, date: new Date(date) },
    update: {},
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { date } = await req.json();
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
  await prisma.blackoutDate.deleteMany({
    where: { tenantId: session.tenantId, date: new Date(date) },
  });
  return NextResponse.json({ success: true });
}
