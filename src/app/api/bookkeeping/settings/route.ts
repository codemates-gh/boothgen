export const dynamic = 'force-dynamic';
// Bookkeeping settings: the mileage log (on/off, rate per mile: the IRS rate automatically, or the operator's own)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bookkeeper } from '@/lib/bookkeeping/auth';
import { getIrsRates, rateOn } from '@/lib/bookkeeping/mileageRates';
import { syncLedger } from '@/lib/bookkeeping/sync';
import { z } from 'zod';

async function view(tenantId: string) {
  const [b, irs] = await Promise.all([
    prisma.tenantBranding.findUnique({ where: { tenantId }, select: { businessAddress: true, mileageEnabled: true, mileageRateCents: true } }),
    getIrsRates(),
  ]);
  return {
    mileageEnabled: b?.mileageEnabled ?? true, mileageRateCents: b?.mileageRateCents ?? null, homeBase: b?.businessAddress ?? null,
    googleConfigured: !!process.env.GOOGLE_MAPS_API_KEY, irsRates: irs, irsRateToday: rateOn(irs, new Date()),
  };
}

export async function GET() {
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  return NextResponse.json(await view(who.tenantId));
}

const Patch = z.object({ mileageEnabled: z.boolean().optional(), mileageRateCents: z.number().int().min(1).max(500).nullable().optional() });

export async function PATCH(req: NextRequest) {
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  await prisma.tenantBranding.upsert({ where: { tenantId: who.tenantId }, update: parsed.data, create: { tenantId: who.tenantId, ...parsed.data } });
  await syncLedger(who.tenantId);
  return NextResponse.json(await view(who.tenantId));
}
