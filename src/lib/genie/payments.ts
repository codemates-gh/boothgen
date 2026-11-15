import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';

// Pay per event (Genie-only stage 2b, docs/genie/genie-only-plan.md):
// - Genie-only accounts pay per event ($15 by default, Super Admin can change it); one payment covers 2 iPads, and a
//   3rd or 4th iPad means paying again.
// - Until an event is paid, the iPad shows a watermark on the booth screen and the photos (bundle `watermark: true`).
//   Everything else works: uploads, texts, emails, galleries.
// - Genius accounts with Genie don't pay per event yet (G: Genie-only first; +$10 per event comes later).

export const PRICE_SETTING = 'genie_event_price_cents';
export const DEFAULT_PRICE_CENTS = 1500;
export const IPADS_PER_PAYMENT = 2;
export const PAYMENT_KIND = 'genie_event';

export async function eventPriceCents(): Promise<number> {
  const s = await prisma.systemSetting.findUnique({ where: { key: PRICE_SETTING } });
  const n = Number(s?.value);
  return Number.isInteger(n) && n >= 50 ? n : DEFAULT_PRICE_CENTS;
}

export const paysPerEvent = (tenant: { product: string }) => tenant.product === 'genie';

export type EventBilling = { paysPerEvent: boolean; paid: boolean; payments: number; ipadsCovered: number; watermark: boolean };

export async function eventBilling(tenant: { id: string; product: string }, eventId: string): Promise<EventBilling> {
  return (await eventsBilling(tenant, [eventId])).get(eventId)!;
}

export async function eventsBilling(tenant: { id: string; product: string }, eventIds: string[]): Promise<Map<string, EventBilling>> {
  const pays = paysPerEvent(tenant);
  const rows = pays && eventIds.length
    ? await prisma.genieEventPayment.groupBy({ by: ['eventId'], where: { tenantId: tenant.id, eventId: { in: eventIds }, status: 'paid' }, _count: { _all: true } })
    : [];
  const by = new Map(rows.map(r => [r.eventId, r._count._all]));
  return new Map(eventIds.map(id => {
    const payments = by.get(id) ?? 0;
    return [id, {
      paysPerEvent: pays,
      paid: !pays || payments > 0,
      payments,
      // Unpaid events can still run 2 iPads, with the watermark
      ipadsCovered: pays ? IPADS_PER_PAYMENT * Math.max(1, payments) : Infinity,
      watermark: pays && payments === 0,
    }];
  }));
}

// Stripe Checkout for one event payment. `appUrl` is where Stripe sends the operator back.
export async function startCheckout(tenant: { id: string; name: string }, event: { id: string; title: string }, appUrl: string, customerEmail?: string | null) {
  const amountCents = await eventPriceCents();
  const sub = await prisma.stripeSubscription.findUnique({ where: { tenantId: tenant.id }, select: { stripeCustomerId: true } });
  const back = `${appUrl}/events/${event.id}/genie`;
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd', unit_amount: amountCents,
        product_data: { name: `Genie event: ${event.title}`.slice(0, 250), description: `One event, up to ${IPADS_PER_PAYMENT} iPads, texts and email included` },
      },
    }],
    ...(sub?.stripeCustomerId ? { customer: sub.stripeCustomerId } : customerEmail ? { customer_email: customerEmail } : {}),
    client_reference_id: tenant.id,
    metadata: { kind: PAYMENT_KIND, tenantId: tenant.id, eventId: event.id },
    payment_intent_data: { metadata: { kind: PAYMENT_KIND, tenantId: tenant.id, eventId: event.id }, description: `Genie event ${event.id} (${tenant.name})`.slice(0, 1000) },
    success_url: `${back}?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
  });
  await prisma.genieEventPayment.create({
    data: { tenantId: tenant.id, eventId: event.id, stripeCheckoutSessionId: session.id, amountCents, ipads: IPADS_PER_PAYMENT },
  });
  return session.url!;
}

// Marks the payment paid from a completed Checkout Session (webhook or the operator coming back). Idempotent.
export async function recordCheckout(session: Pick<Stripe.Checkout.Session, 'id' | 'payment_status' | 'metadata' | 'amount_total' | 'currency'>): Promise<boolean> {
  if (session.metadata?.kind !== PAYMENT_KIND || session.payment_status !== 'paid') return false;
  const { tenantId, eventId } = session.metadata;
  if (!tenantId || !eventId) return false;
  const event = await prisma.event.findFirst({ where: { id: eventId, tenantId }, select: { id: true } });
  if (!event) return false;
  const existing = await prisma.genieEventPayment.findUnique({ where: { stripeCheckoutSessionId: session.id }, select: { status: true } });
  if (existing?.status === 'paid') return true;
  const now = new Date();
  await prisma.genieEventPayment.upsert({
    where: { stripeCheckoutSessionId: session.id },
    update: { status: 'paid', paidAt: now },
    create: {
      tenantId, eventId, stripeCheckoutSessionId: session.id, status: 'paid', paidAt: now,
      amountCents: session.amount_total ?? 0, currency: session.currency ?? 'usd', ipads: IPADS_PER_PAYMENT,
    },
  });
  // Each payment adds 2 iPads to the event
  const paid = await prisma.genieEventPayment.count({ where: { eventId, status: 'paid' } });
  await prisma.eventGenieSettings.updateMany({ where: { eventId, maxDevices: { lt: IPADS_PER_PAYMENT * paid } }, data: { maxDevices: IPADS_PER_PAYMENT * paid } });
  return true;
}
