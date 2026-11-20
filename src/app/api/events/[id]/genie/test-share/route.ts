export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { endedResponse, findAdminEvent, hasEnded } from '@/lib/genie/eventAdmin';
import { TEST_SHARE_LIMITS, sendTestShare, testSharesUsed } from '@/lib/genie/testShares';

// Test Templates: how many test texts and emails this event has left
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const used = await testSharesUsed(event.id);
  return NextResponse.json({ limits: TEST_SHARE_LIMITS, used });
}

const Send = z.object({
  channel: z.enum(['sms', 'email']),
  destination: z.string().trim().min(1).max(200),
  templateName: z.string().trim().min(1).max(200),
  image: z.string().max(5_000_000),
}).strict();

// Sends one template drawn with sample photos to the operator's own phone or email
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Send.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const event = await findAdminEvent(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (hasEnded(event)) return endedResponse();
  const r = await sendTestShare(auth.tenantId, auth.userId, event.id, parsed.data);
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, used: await testSharesUsed(event.id) });
}
