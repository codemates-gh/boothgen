export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { genieUsage } from '@/lib/genie/usage';
import { GENIUS_PAYS_SETTING, GENIUS_PRICE_SETTING, PRICE_SETTING, eventPrices } from '@/lib/genie/payments';

// Super Admin → Genie Usage: per-event usage, both per-event prices and whether Genius accounts pay
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 90, 1), 730);
  const [rows, prices] = await Promise.all([genieUsage(new Date(Date.now() - days * 86400_000)), eventPrices()]);
  return NextResponse.json({ days, priceCents: prices.genieCents, geniusPriceCents: prices.geniusCents, geniusPays: prices.geniusPays, events: rows });
}

const Cents = z.number().int().min(50).max(100_000);
const Body = z.object({ priceCents: Cents.optional(), geniusPriceCents: Cents.optional(), geniusPays: z.boolean().optional() }).strict();

const put = (key: string, value: string) => prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } });

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Price must be between $0.50 and $1,000' }, { status: 400 });
  const { priceCents, geniusPriceCents, geniusPays } = parsed.data;
  await Promise.all([
    priceCents !== undefined && put(PRICE_SETTING, String(priceCents)),
    geniusPriceCents !== undefined && put(GENIUS_PRICE_SETTING, String(geniusPriceCents)),
    geniusPays !== undefined && put(GENIUS_PAYS_SETTING, geniusPays ? 'on' : 'off'),
  ]);
  const p = await eventPrices();
  return NextResponse.json({ priceCents: p.genieCents, geniusPriceCents: p.geniusCents, geniusPays: p.geniusPays });
}
