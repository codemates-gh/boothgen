export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { PropBody, propCategories, propData, propView } from '@/lib/genie/props';

// Every Standard prop (on and off) and the categories
export async function GET() {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const [categories, rows] = await Promise.all([
    propCategories(),
    prisma.genieProp.findMany({ where: { tenantId: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ]);
  return NextResponse.json({ categories, props: rows.map(propView) });
}

// Adds a Standard prop (on for operators straight away)
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const parsed = PropBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const d = await propData(parsed.data, 'standard', null);
  if ('error' in d) return NextResponse.json({ error: d.error }, { status: 422 });
  const last = await prisma.genieProp.findFirst({ where: { tenantId: null }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const p = await prisma.genieProp.create({ data: { ...d.data, tenantId: null, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  return NextResponse.json(propView(p), { status: 201 });
}
