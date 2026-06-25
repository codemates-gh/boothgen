export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';

export async function GET() {
  const [settings, proSubscriberCount] = await Promise.all([
    prisma.systemSetting.findMany({
      where: { key: { in: ['price_display_monthly', 'price_display_annual', 'commission_percentage', 'early_adopter_cap'] } },
    }),
    prisma.stripeSubscription.count({ where: { plan: 'MONTHLY', status: 'ACTIVE' } }),
  ]);

  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));

  const commissionPct = parseFloat(map.commission_percentage ?? '1.5');
  const proMonthlyPrice = parseFloat((map.price_display_monthly ?? '25').replace(/[^0-9.]/g, '')) || 25;
  const earlyAdopterCap = parseInt(map.early_adopter_cap ?? '50') || 50;
  const spotsRemaining = Math.max(0, earlyAdopterCap - proSubscriberCount);
  const subscriptionsOpen = earlyAdopterCap === 0 || proSubscriberCount < earlyAdopterCap;

  return NextResponse.json({
    commissionPct,
    proMonthlyPrice,
    earlyAdopterCap,
    proSubscriberCount,
    spotsRemaining,
    subscriptionsOpen,
  });
}
