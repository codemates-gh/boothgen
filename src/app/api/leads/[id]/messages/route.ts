export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json([], { status: 401 });

  const lead = await prisma.leadSubmission.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!lead) return NextResponse.json([], { status: 404 });

  const messages = await prisma.leadMessage.findMany({
    where: { leadId: params.id },
    orderBy: { sentAt: 'asc' },
  });

  return NextResponse.json(messages);
}
