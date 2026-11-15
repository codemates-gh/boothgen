import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Genie-only stage 2b: pay per event, watermark until paid, usage (docs/genie/genie-only-plan.md)

let sessionTenantId = '';
let globalRole = 'USER';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN', globalRole })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));
const created: any[] = [];
const refunds: any[] = [];
let refundError: any = null;
let retrieved: any = null;
vi.mock('@/lib/stripe', () => ({
  stripe: {
    checkout: {
      sessions: {
        create: vi.fn(async (args: any) => { created.push(args); return { id: 'cs_test_' + randomUUID(), url: 'https://checkout.stripe.test/pay' }; }),
        retrieve: vi.fn(async () => retrieved),
      },
    },
    refunds: { create: vi.fn(async (args: any) => { if (refundError) throw refundError; refunds.push(args); return { id: 're_test' }; }) },
  },
}));

import { prisma } from '@/lib/prisma/client';
import { buildEventBundle } from '@/lib/genie/bundle';
import { eventBilling, recordCheckout, PAYMENT_KIND } from '@/lib/genie/payments';
import { boothEventsClient } from '@/lib/genie/boothEvents';
import { hasProAccess } from '@/lib/auth/session';
import { genieUsage } from '@/lib/genie/usage';
import { POST as PAY, PUT as CONFIRM } from '@/app/api/genie-events/[id]/pay/route';
import { POST as ADMIN_PAYMENTS } from '@/app/api/super-admin/genie-payments/route';
import { DELETE } from '@/app/api/genie-events/[id]/route';
import { GET as DASH } from '@/app/api/events/[id]/genie/route';
import { GET as USAGE, PATCH as SET_PRICE } from '@/app/api/super-admin/genie-usage/route';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const p = (id: string) => ({ params: { id } });

async function setup(product: 'genie' | 'crm' = 'genie') {
  const t = await seedTenant({ pro: false });
  await prisma.tenant.update({ where: { id: t.tenant.id }, data: { product } });
  sessionTenantId = t.tenant.id;
  const client = product === 'genie' ? await boothEventsClient(t.tenant.id) : t.client;
  const event = await seedEvent(t.tenant.id, client.id);
  return { tenant: { ...t.tenant, product }, event };
}

const checkout = (tenantId: string, eventId: string, over: Record<string, unknown> = {}) => ({
  id: 'cs_test_' + randomUUID(), payment_status: 'paid', amount_total: 1500, currency: 'usd',
  metadata: { kind: PAYMENT_KIND, tenantId, eventId }, ...over,
} as any);

beforeEach(async () => { await resetDb(); created.length = 0; refunds.length = 0; refundError = null; retrieved = null; globalRole = 'USER'; await prisma.systemSetting.deleteMany({ where: { key: 'genie_event_price_cents' } }); });
afterAll(async () => { await resetDb(); await prisma.systemSetting.deleteMany({ where: { key: 'genie_event_price_cents' } }); await prisma.$disconnect(); });

describe('who pays and the watermark', () => {
  it('Genie-only events show the watermark until paid; Genius events never do', async () => {
    const { tenant, event } = await setup('genie');
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paysPerEvent: true, paid: false, watermark: true, ipadsCovered: 2 });
    let b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && b.bundle.watermark).toBe(true);
    expect(b.ok && (b.bundle.event as any).clientName).toBeUndefined(); // booth event: no client name
    const before = b.ok ? b.bundleVersion : 0;

    expect(await recordCheckout(checkout(tenant.id, event.id))).toBe(true);
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paid: true, watermark: false, payments: 1 });
    b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && 'watermark' in b.bundle).toBe(false);
    expect(b.ok && b.bundleVersion).toBe(before + 1); // iPads pick it up on the next sync

    const crm = await setup('crm');
    expect(await eventBilling(crm.tenant, crm.event.id)).toMatchObject({ paysPerEvent: false, paid: true, watermark: false });
    const cb = await buildEventBundle(crm.tenant.id, crm.event.id);
    expect(cb.ok && 'watermark' in cb.bundle).toBe(false);
    expect(cb.ok && (cb.bundle.event as any).clientName).toBe('Ana Rivera');
  });

  it('opens galleries and uploads to Genie-only accounts without Pro', async () => {
    const g = await setup('genie');
    expect(await hasProAccess(g.tenant.id)).toBe(true);
    const c = await setup('crm');
    expect(await hasProAccess(c.tenant.id)).toBe(false);
  });
});

describe('recording payments', () => {
  it('is idempotent, and each payment adds 2 iPads', async () => {
    const { tenant, event } = await setup();
    const s = checkout(tenant.id, event.id);
    await recordCheckout(s);
    await recordCheckout(s);
    expect(await prisma.genieEventPayment.count({ where: { eventId: event.id, status: 'paid' } })).toBe(1);
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).maxDevices).toBe(2);
    await recordCheckout(checkout(tenant.id, event.id));
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).maxDevices).toBe(4);
    expect(await eventBilling(tenant, event.id)).toMatchObject({ payments: 2, ipadsCovered: 4 });
  });

  it('ignores other checkouts, unpaid ones, and an event outside the account', async () => {
    const { tenant, event } = await setup();
    const other = await setup();
    expect(await recordCheckout(checkout(tenant.id, event.id, { metadata: { source: 'founding_member' } }))).toBe(false);
    expect(await recordCheckout(checkout(tenant.id, event.id, { payment_status: 'unpaid' }))).toBe(false);
    expect(await recordCheckout(checkout(tenant.id, other.event.id))).toBe(false);
    expect(await prisma.genieEventPayment.count()).toBe(0);
  });
});

describe('pay routes', () => {
  it('starts Checkout at the set price and records the payment when the operator comes back', async () => {
    const { tenant, event } = await setup();
    await prisma.systemSetting.create({ data: { key: 'genie_event_price_cents', value: '1900' } });
    const res = await PAY(req('/x', { method: 'POST' }), p(event.id));
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe('https://checkout.stripe.test/pay');
    const args = created[0];
    expect(args).toMatchObject({ mode: 'payment', metadata: { kind: PAYMENT_KIND, tenantId: tenant.id, eventId: event.id } });
    expect(args.line_items[0].price_data.unit_amount).toBe(1900);
    expect(args.success_url).toBe(`https://boothgen.test/events/${event.id}/genie?paid={CHECKOUT_SESSION_ID}`);
    const pending = await prisma.genieEventPayment.findFirstOrThrow({ where: { eventId: event.id } });
    expect(pending).toMatchObject({ status: 'pending', amountCents: 1900 });

    retrieved = checkout(tenant.id, event.id, { id: pending.stripeCheckoutSessionId, amount_total: 1900 });
    const ok = await CONFIRM(req('/x', { method: 'PUT', body: { sessionId: pending.stripeCheckoutSessionId } }), p(event.id));
    expect(await ok.json()).toEqual({ paid: true });
    expect(await prisma.genieEventPayment.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({ status: 'paid' });

    const dash = await (await DASH(req('/x'), p(event.id))).json();
    expect(dash.billing).toMatchObject({ paysPerEvent: true, paid: true, ipadsCovered: 2, priceCents: 1900 });
  });

  it('refuses a session for another event or account, and Genius accounts', async () => {
    const { tenant, event } = await setup();
    retrieved = checkout(tenant.id, 'another-event');
    expect((await CONFIRM(req('/x', { method: 'PUT', body: { sessionId: retrieved.id } }), p(event.id))).status).toBe(404);
    retrieved = checkout('another-account', event.id);
    expect((await CONFIRM(req('/x', { method: 'PUT', body: { sessionId: retrieved.id } }), p(event.id))).status).toBe(404);
    expect(await prisma.genieEventPayment.count({ where: { status: 'paid' } })).toBe(0);

    const crm = await setup('crm');
    const res = await PAY(req('/x', { method: 'POST' }), p(crm.event.id));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('not_needed');
    expect((await (await DASH(req('/x'), p(crm.event.id))).json()).billing).toEqual({ paysPerEvent: false });
  });

  it('won\'t delete a paid booth event', async () => {
    const { tenant, event } = await setup();
    await recordCheckout(checkout(tenant.id, event.id));
    const res = await DELETE(req('/x', { method: 'DELETE' }), p(event.id));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('paid');
  });
});

describe('usage (Super Admin)', () => {
  it('counts iPads, sessions, photos, texts and emails per event, with payments', async () => {
    const { tenant, event } = await setup();
    await recordCheckout(checkout(tenant.id, event.id));
    const gallery = await prisma.gallery.create({ data: { tenantId: tenant.id, eventId: event.id, title: 'G' } });
    const device = await prisma.genieDevice.create({ data: { tenantId: tenant.id, name: 'iPad', tokenHash: randomUUID(), prefix: randomUUID().slice(0, 8) } });
    await prisma.genieEventDevice.create({ data: { tenantId: tenant.id, eventId: event.id, deviceId: device.id } });
    for (let i = 0; i < 2; i++) {
      const s = await prisma.genieSession.create({ data: { tenantId: tenant.id, eventId: event.id, galleryId: gallery.id, clientId: randomUUID(), publicToken: randomUUID(), startedAt: new Date() } });
      for (const genieKind of ['gallery', 'shot']) {
        await prisma.galleryAsset.create({ data: { galleryId: gallery.id, assetType: 'PHOTO', url: 'https://media.boothgen.test/p.jpg', filename: 'p.jpg', fileSizeBytes: 1, mimeType: 'image/jpeg', genieSessionId: s.id, genieKind } });
      }
      for (const [channel, status] of [['sms', 'delivered'], ['sms', 'failed'], ['email', 'sent']]) {
        await prisma.genieShare.create({ data: { tenantId: tenant.id, eventId: event.id, sessionId: s.id, clientId: randomUUID(), channel, destination: 'x', status, requestedAt: new Date() } });
      }
    }
    const [row] = (await genieUsage(new Date('2026-01-01'))).filter(r => r.eventId === event.id);
    expect(row).toMatchObject({ product: 'genie', ipads: 1, sessions: 2, photos: 2, texts: 2, emails: 2, failed: 2, payments: 1, paidCents: 1500, ipadsCovered: 2 });
  });

  it('is Super Admin only, and sets the price', async () => {
    await setup();
    expect((await USAGE(req('/api/super-admin/genie-usage'))).status).toBe(401);
    globalRole = 'SUPER_ADMIN';
    expect((await USAGE(req('/api/super-admin/genie-usage'))).status).toBe(200);
    expect((await SET_PRICE(req('/x', { method: 'PATCH', body: { priceCents: 10 } }))).status).toBe(400);
    expect((await SET_PRICE(req('/x', { method: 'PATCH', body: { priceCents: 1700 } }))).status).toBe(200);
    expect((await (await USAGE(req('/api/super-admin/genie-usage'))).json()).priceCents).toBe(1700);
  });
});

describe('comps and refunds (Super Admin)', () => {
  const admin = (body: unknown) => ADMIN_PAYMENTS(req('/x', { method: 'POST', body }));
  const settings = (eventId: string) => prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId } });

  it('comps an event: paid at $0, no watermark, and more iPads with each comp', async () => {
    const { tenant, event } = await setup();
    expect((await admin({ action: 'comp', eventId: event.id })).status).toBe(401);
    globalRole = 'SUPER_ADMIN';
    expect((await admin({ action: 'comp', eventId: event.id })).status).toBe(200);
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paid: true, watermark: false, payments: 1 });
    await admin({ action: 'comp', eventId: event.id });
    expect((await settings(event.id)).maxDevices).toBe(4);
    const [row] = (await genieUsage(new Date('2026-01-01'))).filter(r => r.eventId === event.id);
    expect(row.paymentList).toHaveLength(2);
    expect(row.paymentList.every(p => p.comp && p.amountCents === 0)).toBe(true);
    expect(row.paidCents).toBe(0);
    expect(refunds).toHaveLength(0);
  });

  it('refunds a Stripe payment in full: back to unpaid, 2 iPads, and a late webhook can\'t undo it', async () => {
    const { tenant, event } = await setup();
    globalRole = 'SUPER_ADMIN';
    const s1 = checkout(tenant.id, event.id), s2 = checkout(tenant.id, event.id);
    await recordCheckout(s1); await recordCheckout(s2);
    expect((await settings(event.id)).maxDevices).toBe(4);
    const pay1 = await prisma.genieEventPayment.findUniqueOrThrow({ where: { stripeCheckoutSessionId: s1.id } });
    const pay2 = await prisma.genieEventPayment.findUniqueOrThrow({ where: { stripeCheckoutSessionId: s2.id } });

    retrieved = { ...s1, payment_intent: 'pi_test_1' };
    expect((await admin({ action: 'refund', paymentId: pay1.id })).status).toBe(200);
    expect(refunds[0]).toMatchObject({ payment_intent: 'pi_test_1' });
    expect((await settings(event.id)).maxDevices).toBe(2);
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paid: true, payments: 1 });

    retrieved = { ...s2, payment_intent: 'pi_test_2' };
    await admin({ action: 'refund', paymentId: pay2.id });
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paid: false, watermark: true });
    const b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && b.bundle.watermark).toBe(true);

    // Stripe re-sends the original checkout webhook: stays refunded
    await recordCheckout(s1);
    expect((await prisma.genieEventPayment.findUniqueOrThrow({ where: { id: pay1.id } })).status).toBe('refunded');
    // Refunding twice is refused
    expect((await admin({ action: 'refund', paymentId: pay1.id })).status).toBe(409);

    const dash = await (await DASH(req('/x'), p(event.id))).json();
    expect(dash.billing.history.map((h: any) => h.status)).toEqual(['refunded', 'refunded']);
  });

  it('records a refund already made in the Stripe dashboard, and reports other Stripe errors', async () => {
    const { tenant, event } = await setup();
    globalRole = 'SUPER_ADMIN';
    const s = checkout(tenant.id, event.id);
    await recordCheckout(s);
    const pay = await prisma.genieEventPayment.findUniqueOrThrow({ where: { stripeCheckoutSessionId: s.id } });
    retrieved = { ...s, payment_intent: 'pi_x' };
    refundError = Object.assign(new Error('Card declined the refund'), { code: 'card_error' });
    const bad = await admin({ action: 'refund', paymentId: pay.id });
    expect(bad.status).toBe(502);
    expect((await prisma.genieEventPayment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe('paid');
    refundError = Object.assign(new Error('already'), { code: 'charge_already_refunded' });
    expect((await admin({ action: 'refund', paymentId: pay.id })).status).toBe(200);
    expect((await prisma.genieEventPayment.findUniqueOrThrow({ where: { id: pay.id } })).status).toBe('refunded');
  });
});
