export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { ensurePlaceholders, themeView } from '@/lib/genie/ai/themes';

// Every Standard Geniefied theme (on and off), with prompts
export async function GET() {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const rows = await ensurePlaceholders(await prisma.genieAiTheme.findMany({ where: { tenantId: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }));
  return NextResponse.json({ themes: rows.map(t => themeView(t, true)) });
}
