export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['price_display_monthly', 'price_display_annual'] } },
  });
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  return NextResponse.json({
    monthly: map.price_display_monthly ?? '',
    annual: map.price_display_annual ?? '',
  });
}
