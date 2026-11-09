export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma/client';

function isSuperAdmin() {
  const c = cookies();
  return c.get('sa_session')?.value === process.env.SUPER_ADMIN_SECRET;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isSuperAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const data = await req.json();
  const allowed = ['name', 'description', 'format', 'orientation', 'photoCount', 'thumbnailUrl', 'textZones', 'colorVariants', 'fontPairings', 'isPublished', 'sortOrder'];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in data) update[key] = data[key];
  }
  if ('photoCount' in update) update.photoCount = Number(update.photoCount);
  const template = await prisma.boothDesignTemplate.update({ where: { id: params.id }, data: update });
  return NextResponse.json(template);
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  if (!isSuperAdmin()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.boothDesignTemplate.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
