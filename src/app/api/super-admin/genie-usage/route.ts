export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { genieUsage } from '@/lib/genie/usage';
import { PRICE_SETTING, eventPriceCents } from '@/lib/genie/payments';

// Super Admin → Genie Usage: per-event usage and the Genie-only event price
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 90, 1), 730);
  const [rows, priceCents] = await Promise.all([genieUsage(new Date(Date.now() - days * 86400_000)), eventPriceCents()]);
  return NextResponse.json({ days, priceCents, events: rows });
}

const Body = z.object({ priceCents: z.number().int().min(50).max(100_000) }).strict();

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Price must be between $0.50 and $1,000' }, { status: 400 });
  const value = String(parsed.data.priceCents);
  await prisma.systemSetting.upsert({ where: { key: PRICE_SETTING }, update: { value }, create: { key: PRICE_SETTING, value } });
  return NextResponse.json({ priceCents: parsed.data.priceCents });
}
