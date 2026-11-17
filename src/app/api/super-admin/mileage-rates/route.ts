export const dynamic = 'force-dynamic';
// Super Admin → Settings → IRS Mileage Rates: list (GET), check the IRS page now (POST), correct the list (PUT)
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminSession } from '@/lib/auth/session';
import { checkIrsRates, getIrsRates, saveIrsRates, IRS_RATES_URL } from '@/lib/bookkeeping/mileageRates';
import { z } from 'zod';

export async function GET() {
  await requireSuperAdminSession();
  return NextResponse.json({ rates: await getIrsRates(), source: IRS_RATES_URL });
}

export async function POST() {
  await requireSuperAdminSession();
  const r = await checkIrsRates();
  return NextResponse.json({ ...r, rates: await getIrsRates() });
}

const Put = z.object({ rates: z.array(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cents: z.number().min(1).max(500), source: z.string().max(40).optional() })).max(100) });

export async function PUT(req: NextRequest) {
  await requireSuperAdminSession();
  const parsed = Put.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid rates' }, { status: 400 });
  await saveIrsRates(parsed.data.rates);
  return NextResponse.json({ rates: await getIrsRates() });
}
