export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';

const Body = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(60),
  parentId: z.string().min(1).nullable(),
}).strict();

function slug(name: string) {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'category';
}

// Adds a category (parentId null) or a sub-category
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const { name, parentId } = parsed.data;
  if (parentId) {
    const parent = await prisma.geniePropCategory.findUnique({ where: { id: parentId } });
    if (!parent || parent.parentId) return NextResponse.json({ error: 'Category not found' }, { status: 404 });
  }
  // ids are slugs and unique across categories and sub-categories
  let id = slug(name);
  for (let i = 2; await prisma.geniePropCategory.findUnique({ where: { id } }); i++) id = `${slug(name)}-${i}`;
  const last = await prisma.geniePropCategory.findFirst({ where: { parentId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const c = await prisma.geniePropCategory.create({ data: { id, name, parentId, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  return NextResponse.json(c, { status: 201 });
}
