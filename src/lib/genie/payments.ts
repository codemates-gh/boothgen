import type Stripe from 'stripe';
import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';
import { sendEmail } from '@/lib/email/send';

// Pay per event (Genie-only stage 2b, docs/genie/genie-only-plan.md):
// - Genie-only accounts pay per event ($15 by default); one payment covers 2 iPads, and a 3rd or 4th iPad means
//   paying again.
// - Genius accounts pay less per event ($10 by default) once Super Admin turns on "Genius pays per event", except
//   accounts marked "Keep Genius free". Both prices and the switch are Super Admin settings (Genie Usage).
// - Until an event is paid, the iPad shows a watermark on the booth screen and the photos (bundle `watermark: true`).
//   Everything else works: uploads, texts, emails, galleries.

export const PRICE_SETTING = 'genie_event_price_cents';
export const DEFAULT_PRICE_CENTS = 1500;
export const GENIUS_PRICE_SETTING = 'genie_event_price_cents_genius';
export const DEFAULT_GENIUS_PRICE_CENTS = 1000;
export const GENIUS_PAYS_SETTING = 'genius_pays_per_event';
export const IPADS_PER_PAYMENT = 2;
export const PAYMENT_KIND = 'genie_event';

const cents = (v: string | undefined, fallback: number) => { const n = Number(v); return Number.isInteger(n) && n >= 50 ? n : fallback; };

export type EventPrices = { genieCents: number; geniusCents: number; geniusPays: boolean };

// Both per-event prices and whether Genius accounts pay yet (Super Admin → Genie Usage)
export async function eventPrices(): Promise<EventPrices> {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: [PRICE_SETTING, GENIUS_PRICE_SETTING, GENIUS_PAYS_SETTING] } } });
  const m = new Map(rows.map(r => [r.key, r.value]));
  return {
    genieCents: cents(m.get(PRICE_SETTING), DEFAULT_PRICE_CENTS),
    geniusCents: cents(m.get(GENIUS_PRICE_SETTING), DEFAULT_GENIUS_PRICE_CENTS),
    geniusPays: m.get(GENIUS_PAYS_SETTING) === 'on',
  };
}

// The Genie-only price
export async function eventPriceCents(): Promise<number> {
  return (await eventPrices()).genieCents;
}

export const fmtPrice = (c: number) => c % 100 === 0 ? `$${c / 100}` : `$${(c / 100).toFixed(2)}`;

type BillingTenant = { id: string; product: string; geniusFree?: boolean };

// What this account pays per event, or null when it doesn't pay per event
export function priceFor(tenant: { product: string; geniusFree: boolean }, p: EventPrices): number | null {
  if (tenant.product === 'genie') return p.genieCents;
  if (tenant.product !== 'crm' || !p.geniusPays || tenant.geniusFree) return null;
  return p.geniusCents;
}

export async function eventPriceFor(tenant: BillingTenant): Promise<number | null> {
  const geniusFree = tenant.geniusFree ?? (tenant.product === 'crm'
    ? (await prisma.tenant.findUnique({ where: { id: tenant.id }, select: { geniusFree: true } }))?.geniusFree ?? false
    : false);
  return priceFor({ product: tenant.product, geniusFree }, await eventPrices());
}

export type EventBilling = { paysPerEvent: boolean; priceCents: number | null; paid: boolean; payments: number; ipadsCovered: number; watermark: boolean };

export async function eventBilling(tenant: BillingTenant, eventId: string): Promise<EventBilling> {
  return (await eventsBilling(tenant, [eventId])).get(eventId)!;
}

export async function eventsBilling(tenant: BillingTenant, eventIds: string[]): Promise<Map<string, EventBilling>> {
  const priceCents = await eventPriceFor(tenant);
  const pays = priceCents !== null;
  const rows = pays && eventIds.length
    ? await prisma.genieEventPayment.groupBy({ by: ['eventId'], where: { tenantId: tenant.id, eventId: { in: eventIds }, status: 'paid' }, _count: { _all: true } })
    : [];
  const by = new Map(rows.map(r => [r.eventId, r._count._all]));
  return new Map(eventIds.map(id => {
    const payments = by.get(id) ?? 0;
    return [id, {
      paysPerEvent: pays,
      priceCents,
      paid: !pays || payments > 0,
      payments,
      // Unpaid events can still run 2 iPads, with the watermark
      ipadsCovered: pays ? IPADS_PER_PAYMENT * Math.max(1, payments) : Infinity,
      watermark: pays && payments === 0,
    }];
  }));
}

// Stripe Checkout for one event payment. `appUrl` is where Stripe sends the operator back.
export async function startCheckout(tenant: { id: string; name: string; product: string; geniusFree?: boolean }, event: { id: string; title: string }, appUrl: string, customerEmail?: string | null) {
  const amountCents = await eventPriceFor(tenant);
  if (amountCents === null) throw new Error('This account does not pay per event');
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
  // Already recorded, or refunded since (a late or repeated webhook must not undo a refund)
  if (existing?.status === 'paid' || existing?.status === 'refunded') return true;
  const now = new Date();
  await prisma.genieEventPayment.upsert({
    where: { stripeCheckoutSessionId: session.id },
    update: { status: 'paid', paidAt: now },
    create: {
      tenantId, eventId, stripeCheckoutSessionId: session.id, status: 'paid', paidAt: now,
      amountCents: session.amount_total ?? 0, currency: session.currency ?? 'usd', ipads: IPADS_PER_PAYMENT,
    },
  });
  await syncIpads(eventId);
  return true;
}

// Each payment adds 2 iPads to the event; never fewer than 2 (unpaid events still run 2, with the watermark)
async function syncIpads(eventId: string) {
  const paid = await prisma.genieEventPayment.count({ where: { eventId, status: 'paid' } });
  await prisma.eventGenieSettings.updateMany({ where: { eventId }, data: { maxDevices: IPADS_PER_PAYMENT * Math.max(1, paid) } });
}

// ── Super Admin: comps and refunds ────────────────────────────────────────
// A comp is a $0 payment BoothGen gives (test events, goodwill). Its id starts with "comp_" instead of a Stripe
// Checkout Session id.
export const COMP_PREFIX = 'comp_';
export const isComp = (p: { stripeCheckoutSessionId: string }) => p.stripeCheckoutSessionId.startsWith(COMP_PREFIX);

export async function compEvent(eventId: string) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, tenantId: true, genieSettings: { select: { id: true } } } });
  if (!event?.genieSettings) return null;
  const payment = await prisma.genieEventPayment.create({
    data: {
      tenantId: event.tenantId, eventId, stripeCheckoutSessionId: COMP_PREFIX + crypto.randomUUID(),
      amountCents: 0, status: 'paid', paidAt: new Date(), ipads: IPADS_PER_PAYMENT,
    },
  });
  await syncIpads(eventId);
  return payment;
}

export type RefundResult = { ok: true } | { ok: false; status: 404 | 409 | 502; error: string };

// Refunds a Stripe payment in full (or removes a comp). The event goes back to unpaid (watermark) unless it has
// other payments; iPads already on the event stay until released.
export async function refundPayment(paymentId: string): Promise<RefundResult> {
  const p = await prisma.genieEventPayment.findUnique({ where: { id: paymentId } });
  if (!p) return { ok: false, status: 404, error: 'Payment not found' };
  if (p.status !== 'paid') return { ok: false, status: 409, error: p.status === 'refunded' ? 'Already refunded' : p.status === 'disputed' ? 'This payment is disputed; respond to the dispute in Stripe' : 'This payment was never completed' };
  if (!isComp(p)) {
    try {
      const session = await stripe.checkout.sessions.retrieve(p.stripeCheckoutSessionId);
      const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      if (!intent) return { ok: false, status: 409, error: 'Stripe has no payment for this checkout' };
      await stripe.refunds.create({ payment_intent: intent, metadata: { kind: PAYMENT_KIND, paymentId: p.id } });
    } catch (err: any) {
      // Refunded already in the Stripe dashboard: record it here too
      if (err?.code !== 'charge_already_refunded') return { ok: false, status: 502, error: 'Stripe: ' + (err?.message ?? 'refund failed') };
    }
  }
  await prisma.genieEventPayment.update({ where: { id: p.id }, data: { status: 'refunded' } });
  await syncIpads(p.eventId);
  return { ok: true };
}

// ── Refunds and chargebacks made outside BoothGen (Stripe dashboard, the operator's bank) ──
// charge.refunded (in full) marks the payment refunded; charge.dispute.created marks it disputed and emails BoothGen
// the event's usage (evidence for the dispute). Either way the event is unpaid again (watermark from the next sync).
async function paymentForIntent(intentId: string) {
  const list = await stripe.checkout.sessions.list({ payment_intent: intentId, limit: 1 }).catch(() => null);
  const session = list?.data[0];
  if (!session || session.metadata?.kind !== PAYMENT_KIND) return null;
  return prisma.genieEventPayment.findUnique({ where: { stripeCheckoutSessionId: session.id } });
}

export async function recordStripeRefundOrDispute(kind: 'refunded' | 'disputed', intentId: string | null | undefined): Promise<boolean> {
  if (!intentId) return false;
  const p = await paymentForIntent(intentId);
  if (!p || p.status === kind || p.status === 'refunded') return false;
  await prisma.genieEventPayment.update({ where: { id: p.id }, data: { status: kind } });
  await syncIpads(p.eventId);
  if (kind === 'disputed') await notifyDispute(p.eventId, p.amountCents).catch(e => console.error('[genie-payments] dispute email failed:', e));
  return true;
}

async function notifyDispute(eventId: string, amountCents: number) {
  const to = process.env.SUPER_ADMIN_NOTIFY_EMAIL;
  if (!to) return;
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { title: true, eventDate: true, tenant: { select: { name: true } } } });
  const [sessions, shares, devices] = await Promise.all([
    prisma.genieSession.count({ where: { eventId } }),
    prisma.genieShare.groupBy({ by: ['channel'], where: { eventId, status: { not: 'failed' } }, _count: { _all: true } }),
    prisma.genieEventDevice.count({ where: { eventId } }),
  ]);
  const n = (c: string) => shares.find(s => s.channel === c)?._count._all ?? 0;
  const esc = (v: string) => v.replace(/[<>&"]/g, '');
  await sendEmail(to, `Chargeback on a Genie event: ${event.tenant.name}`, `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#374151">
  <h2 style="font-size:18px;color:#111827">A Genie event payment was disputed</h2>
  <p><strong>${esc(event.tenant.name)}</strong> disputed $${(amountCents / 100).toFixed(2)} for <strong>${esc(event.title)}</strong> (${event.eventDate.toISOString().slice(0, 10)}).</p>
  <p>Usage you can cite as evidence: ${sessions} guest sessions, ${n('sms')} texts and ${n('email')} emails sent, ${devices} iPad${devices === 1 ? '' : 's'} used.</p>
  <p>The event is unpaid again in BoothGen. Respond to the dispute in the Stripe dashboard.</p>
</div>`);
}
