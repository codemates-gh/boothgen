export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';
import { requireGenieAdmin } from '@/lib/genie/admin';
import { PAYMENT_KIND, eventPriceFor, recordCheckout, startCheckout } from '@/lib/genie/payments';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com';

async function load(tenantId: string, eventId: string) {
  const [tenant, event] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true, product: true, geniusFree: true } }),
    prisma.event.findFirst({ where: { id: eventId, tenantId }, select: { id: true, title: true, genieSettings: { select: { id: true } } } }),
  ]);
  return { tenant, event };
}

// Starts Stripe Checkout for one event payment (another payment adds 2 more iPads)
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const { tenant, event } = await load(auth.tenantId, params.id);
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if ((await eventPriceFor(tenant)) === null) return NextResponse.json({ error: 'Your plan doesn\'t pay per event', code: 'not_needed' }, { status: 409 });
  if (!event.genieSettings) return NextResponse.json({ error: 'Set up Genie for this event first', code: 'not_configured' }, { status: 409 });
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { email: true } });
  const url = await startCheckout(tenant, event, APP_URL, user?.email);
  return NextResponse.json({ url });
}

const Confirm = z.object({ sessionId: z.string().min(1).max(255) }).strict();

// The operator came back from Checkout: record the payment now instead of waiting for the webhook
export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireGenieAdmin();
  if (auth instanceof NextResponse) return auth;
  const parsed = Confirm.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId).catch(() => null);
  if (!session || session.metadata?.kind !== PAYMENT_KIND || session.metadata.tenantId !== auth.tenantId || session.metadata.eventId !== params.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ paid: await recordCheckout(session) });
}
