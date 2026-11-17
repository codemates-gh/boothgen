export const dynamic = 'force-dynamic';
// Rename or hide a category (hidden ones stay on past transactions but aren't offered for new ones)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bookkeeper } from '@/lib/bookkeeping/auth';
import { z } from 'zod';

const Patch = z.object({ name: z.string().trim().min(1).max(60).optional(), hidden: z.boolean().optional() });

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const cat = await prisma.ledgerCategory.findFirst({ where: { id, tenantId: who.tenantId } });
  if (!cat) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  if (parsed.data.name) {
    const clash = await prisma.ledgerCategory.findFirst({ where: { tenantId: who.tenantId, type: cat.type, id: { not: id }, name: { equals: parsed.data.name, mode: 'insensitive' } } });
    if (clash) return NextResponse.json({ error: 'That category already exists' }, { status: 409 });
  }
  return NextResponse.json(await prisma.ledgerCategory.update({ where: { id }, data: parsed.data }));
}
