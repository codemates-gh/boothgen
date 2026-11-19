export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { poseView } from '@/lib/genie/poses';

// Every Standard pose (on and off)
export async function GET() {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const rows = await prisma.geniePose.findMany({ where: { tenantId: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  return NextResponse.json({ poses: rows.map(poseView) });
}
