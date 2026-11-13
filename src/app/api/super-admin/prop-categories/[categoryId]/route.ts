export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';

type Ctx = { params: { categoryId: string } };
const Body = z.object({ name: z.string().trim().min(1, 'Give it a name').max(60) }).strict();

// Renames a category or sub-category (its id, which props and bundles use, stays the same)
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const c = await prisma.geniePropCategory.findUnique({ where: { id: params.categoryId } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(await prisma.geniePropCategory.update({ where: { id: c.id }, data: { name: parsed.data.name } }));
}

// Deletes an empty category or sub-category
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const c = await prisma.geniePropCategory.findUnique({ where: { id: params.categoryId } });
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!c.parentId && await prisma.geniePropCategory.count({ where: { parentId: c.id } })) {
    return NextResponse.json({ error: 'Delete or move its sub-categories first.' }, { status: 409 });
  }
  const pattern = '%' + JSON.stringify(c.id).slice(1, -1).replace(/[\\%_]/g, m => '\\' + m) + '%';
  const [{ n }] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM genie_props WHERE category = ${c.id} OR subcategory = ${c.id} OR "alsoIn"::text LIKE ${pattern}`;
  if (Number(n) > 0) return NextResponse.json({ error: `${n} prop${Number(n) === 1 ? ' is' : 's are'} listed here. Move ${Number(n) === 1 ? 'it' : 'them'} to another sub-category first.` }, { status: 409 });
  await prisma.geniePropCategory.delete({ where: { id: c.id } });
  return NextResponse.json({ ok: true });
}
