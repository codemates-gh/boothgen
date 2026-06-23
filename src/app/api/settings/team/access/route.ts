export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { prisma } from '@/lib/prisma/client';

const ALLOWED_MODULES = ['events', 'calendar', 'leads', 'quotes', 'invoices', 'clients', 'gallery'];

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.tenantRole !== 'HOST_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { modules } = await req.json();
  if (!Array.isArray(modules)) return NextResponse.json({ error: 'modules must be an array' }, { status: 400 });

  const sanitized = modules.filter((m: string) => ALLOWED_MODULES.includes(m));
  if (sanitized.length === 0) return NextResponse.json({ error: 'At least one module must be enabled' }, { status: 400 });

  await prisma.tenant.update({
    where: { id: session.tenantId },
    data: { teamMemberAccess: JSON.stringify(sanitized) },
  });

  return NextResponse.json({ teamMemberAccess: JSON.stringify(sanitized) });
}
