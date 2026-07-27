export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  await requireSuperAdminSession();
  const [settings, members] = await Promise.all([
    prisma.systemSetting.findMany({
      where: { key: { in: ['founding_enabled', 'founding_round', 'founding_spots_limit'] } },
    }),
    prisma.foundingMember.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, paymentEmail: true, name: true, company: true,
        tier: true, amountCents: true, status: true, createdAt: true,
      },
    }),
  ]);
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  return NextResponse.json({ settings: map, members });
}

export async function PATCH(req: NextRequest) {
  await requireSuperAdminSession();
  const body = await req.json();
  const allowed = ['founding_enabled', 'founding_round', 'founding_spots_limit'];
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.includes(key)) continue;
    await prisma.systemSetting.upsert({
      where:  { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  }
  return NextResponse.json({ ok: true });
}
