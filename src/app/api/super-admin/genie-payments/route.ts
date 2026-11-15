export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdminApi } from '@/lib/genie/admin';
import { compEvent, refundPayment } from '@/lib/genie/payments';

// Super Admin → Genie Usage: comp an event (mark it paid at $0) or refund a payment
const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('comp'), eventId: z.string().min(1) }),
  z.object({ action: z.literal('refund'), paymentId: z.string().min(1) }),
]);

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if (auth instanceof NextResponse) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  if (parsed.data.action === 'comp') {
    const p = await compEvent(parsed.data.eventId);
    return p ? NextResponse.json({ ok: true, paymentId: p.id }) : NextResponse.json({ error: 'Event not found or Genie not set up' }, { status: 404 });
  }
  const r = await refundPayment(parsed.data.paymentId);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
