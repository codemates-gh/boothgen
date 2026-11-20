export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { MusicLinkBody } from './body';

// Adds a royalty-free music site to the 360 Music block
export async function POST(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const parsed = MusicLinkBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  const last = await prisma.genieMusicLink.findFirst({ orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
  const l = await prisma.genieMusicLink.create({ data: { ...parsed.data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  return NextResponse.json({ link: l }, { status: 201 });
}
