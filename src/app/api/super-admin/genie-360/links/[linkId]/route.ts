export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { MusicLinkPatch } from '../body';

type Ctx = { params: Promise<{ linkId: string }> };

export async function PATCH(req: NextRequest, props: Ctx) {
  const { linkId } = await props.params;
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const parsed = MusicLinkPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const l = await prisma.genieMusicLink.findUnique({ where: { id: linkId } });
  if (!l) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ link: await prisma.genieMusicLink.update({ where: { id: l.id }, data: parsed.data }) });
}

export async function DELETE(_req: NextRequest, props: Ctx) {
  const { linkId } = await props.params;
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  await prisma.genieMusicLink.deleteMany({ where: { id: linkId } });
  return NextResponse.json({ ok: true });
}
