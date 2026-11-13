export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { backdropView } from '@/lib/genie/backdrops';

// Every Standard backdrop (on and off)
export async function GET() {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const rows = await prisma.genieBackdrop.findMany({ where: { tenantId: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return NextResponse.json({ backdrops: rows.map(backdropView) });
}
