export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';
import { seedTenantEmailDefaults } from '@/lib/tenant/seed-email-defaults';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if ((session as any)?.globalRole !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const tenantId: string | undefined = body.tenantId;

  const tenants = tenantId
    ? await prisma.tenant.findMany({ where: { id: tenantId } })
    : await prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });

  const results: Record<string, { created: string[]; skipped: string[] }> = {};
  for (const tenant of tenants) {
    results[tenant.name] = await seedTenantEmailDefaults(tenant.id);
  }

  return NextResponse.json({ success: true, results });
}
