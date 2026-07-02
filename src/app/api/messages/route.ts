export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });

  // Match both new messages (tenantId set) and old messages (tenantId null, matched via lead)
  const messages = await prisma.leadMessage.findMany({
    where: {
      OR: [
        { tenantId: session.tenantId },
        { lead: { tenantId: session.tenantId } },
      ],
    },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, email: true, status: true, convertedToEventId: true } },
      event: { select: { id: true, title: true, client: { select: { firstName: true, lastName: true, email: true } } } },
    },
    orderBy: { sentAt: 'desc' },
    take: 500,
  });

  return NextResponse.json(messages);
}
