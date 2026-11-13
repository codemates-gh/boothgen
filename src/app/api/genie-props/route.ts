export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { PropBody, propCategories, propData, propView } from '@/lib/genie/props';

// The operator's props library: Standard props that are switched on, plus My props
export async function GET() {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const [categories, rows] = await Promise.all([
    propCategories(),
    prisma.genieProp.findMany({ where: { OR: [{ tenantId: null, isActive: true }, { tenantId: auth.tenantId }] }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
  ]);
  const props = rows.map(propView);
  return NextResponse.json({ categories, standard: props.filter(p => p.source === 'standard'), mine: props.filter(p => p.source === 'account') });
}

// Adds one of My props
export async function POST(req: NextRequest) {
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = PropBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const d = await propData(parsed.data, 'mine', auth.tenantId);
  if ('error' in d) return NextResponse.json({ error: d.error }, { status: 422 });
  const p = await prisma.genieProp.create({ data: { ...d.data, tenantId: auth.tenantId } });
  return NextResponse.json(propView(p), { status: 201 });
}
