export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const profiles = await prisma.consumableProfile.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
  return NextResponse.json(profiles);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId || session.tenantRole !== 'HOST_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { name, costPerPrintCents, isDefault } = await req.json();
  if (!name || costPerPrintCents == null) {
    return NextResponse.json({ error: 'name and costPerPrintCents required' }, { status: 400 });
  }

  if (isDefault) {
    await prisma.consumableProfile.updateMany({
      where: { tenantId: session.tenantId },
      data: { isDefault: false },
    });
  }

  const profile = await prisma.consumableProfile.create({
    data: {
      tenantId: session.tenantId,
      name,
      costPerPrintCents: Math.round(costPerPrintCents),
      isDefault: Boolean(isDefault),
    },
  });
  return NextResponse.json(profile, { status: 201 });
}
