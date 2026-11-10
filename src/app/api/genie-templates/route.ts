export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { libraryView, libraryWhere } from '@/lib/genie/library';

// Genie template library for the event template picker: Standard and My templates
export async function GET() {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const rows = await prisma.boothDesignTemplate.findMany({ where: libraryWhere(auth.tenantId), orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  const all = rows.map(libraryView).filter(t => t.layout);
  return NextResponse.json({ standard: all.filter(t => t.scope === 'standard'), mine: all.filter(t => t.scope === 'mine') });
}
