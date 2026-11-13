export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { backdropView } from '@/lib/genie/backdrops';

// The operator's backdrops library: Standard backdrops that are switched on, plus My backdrops
export async function GET() {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const rows = await prisma.genieBackdrop.findMany({ where: { OR: [{ tenantId: null, isActive: true }, { tenantId: auth.tenantId }] }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  const all = rows.map(backdropView);
  return NextResponse.json({ standard: all.filter(b => b.source === 'standard'), mine: all.filter(b => b.source === 'account') });
}
