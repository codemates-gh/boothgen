export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { STARTER_THEMES } from '@/lib/genie/ai/themes';

// Adds the 12 starter themes (without samples) that aren't in the Standard library yet
export async function POST() {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const have = new Set((await prisma.genieAiTheme.findMany({ where: { id: { in: STARTER_THEMES.map(t => t.id) } }, select: { id: true } })).map(t => t.id));
  const add = STARTER_THEMES.filter(t => !have.has(t.id));
  await prisma.genieAiTheme.createMany({ data: add.map((t, i) => ({ ...t, tenantId: null, sortOrder: i })) });
  return NextResponse.json({ added: add.length });
}
