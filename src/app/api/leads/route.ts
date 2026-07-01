export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });
  const leads = await prisma.leadSubmission.findMany({
    where: { tenantId: session.tenantId, eventDate: { not: null } },
    select: { id: true, firstName: true, lastName: true, eventDate: true, eventType: true, status: true, convertedToEventId: true },
    orderBy: { eventDate: 'asc' },
  });
  return NextResponse.json(leads);
}
