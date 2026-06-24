export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { randomBytes } from 'crypto';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { calendarToken: true } });
  if (!tenant?.calendarToken) {
    const token = randomBytes(20).toString('hex');
    tenant = await prisma.tenant.update({ where: { id: session.tenantId }, data: { calendarToken: token }, select: { calendarToken: true } });
  }
  return NextResponse.json({ token: tenant!.calendarToken });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const token = randomBytes(20).toString('hex');
  const tenant = await prisma.tenant.update({ where: { id: session.tenantId }, data: { calendarToken: token }, select: { calendarToken: true } });
  return NextResponse.json({ token: tenant.calendarToken });
}
