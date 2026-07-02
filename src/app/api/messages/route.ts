export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 200 });

  // Backfill tenantId on lead messages that predate this feature
  await prisma.$executeRaw`
    UPDATE lead_messages lm
    SET tenant_id = ls.tenant_id
    FROM lead_submissions ls
    WHERE lm.lead_id = ls.id AND lm.tenant_id IS NULL
  `;

  // Include old messages that predate tenantId (matched via the lead's tenantId)
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
