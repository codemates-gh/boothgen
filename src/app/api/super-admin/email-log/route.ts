export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session as any)?.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const statusFilter = searchParams.get('status'); // SENT | FAILED | SKIPPED | null = all
  const tenantId = searchParams.get('tenantId') ?? undefined;
  const take = 50;

  const where: any = {
    NOT: { status: 'SCHEDULED' },
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(tenantId ? { tenantId } : {}),
  };

  const [executions, total, failedTotal] = await Promise.all([
    prisma.automationExecution.findMany({
      where,
      include: {
        tenant: { select: { name: true, branding: { select: { companyName: true } } } },
        rule: { select: { name: true, trigger: true } },
        event: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip: (page - 1) * take,
    }),
    prisma.automationExecution.count({ where }),
    prisma.automationExecution.count({ where: { status: 'FAILED' } }),
  ]);

  return NextResponse.json({ executions, total, failedTotal, page, pageSize: take });
}
