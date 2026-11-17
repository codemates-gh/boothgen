import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

let tenantId = '';
let role = 'HOST_ADMIN';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId, tenantRole: role })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/stripe', () => ({ stripe: { paymentIntents: { retrieve: vi.fn(async () => ({ application_fee_amount: 4200 })) }, refunds: { create: vi.fn(async () => ({ id: 're_1' })) } } }));

import { prisma } from '@/lib/prisma/client';
import { stripe } from '@/lib/stripe';
import { syncLedger } from '@/lib/bookkeeping/sync';
import { GET as LIST, POST as CREATE } from '@/app/api/bookkeeping/transactions/route';
import { DELETE as DELETE_ONE } from '@/app/api/bookkeeping/transactions/[id]/route';
import { POST as BULK } from '@/app/api/bookkeeping/transactions/bulk/route';
import { GET as REPORTS } from '@/app/api/bookkeeping/reports/route';
import { POST as REFUND } from '@/app/api/bookkeeping/transactions/[id]/refund/route';
import { POST as CANCEL } from '@/app/api/events/[id]/cancel/route';
import { recordStripeRefund } from '@/lib/bookkeeping/refunds';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const p = (id: string) => ({ params: Promise.resolve({ id }) });

async function setup() {
  const { tenant, client } = await seedTenant({ pro: true });
  tenantId = tenant.id;
  role = 'HOST_ADMIN';
  const event = await seedEvent(tenant.id, client.id, { settings: false, templates: 0 });
  return { tenant, client, event };
}

async function invoice(clientId: string, eventId: string, totalCents: number, extra: Record<string, unknown> = {}) {
  return prisma.invoice.create({
    data: { tenantId, clientId, eventId, invoiceNumber: 'INV-' + randomUUID().slice(0, 6), status: 'SENT', subtotalCents: totalCents, totalCents, balanceDueCents: totalCents, ...extra },
  });
}

beforeEach(async () => { await resetDb(); vi.mocked(stripe.paymentIntents.retrieve).mockClear(); vi.mocked(stripe.refunds.create).mockClear(); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Bookkeeping sync', () => {
  it('adds paid invoices and Stripe fees once, and removes a payment that was undone', async () => {
    const { client, event } = await setup();
    // Marked paid by hand (Payment row)
    const manual = await invoice(client.id, event.id, 150000, { status: 'PAID', paidAt: new Date(), amountPaidCents: 150000, balanceDueCents: 0 });
    const pay = await prisma.payment.create({ data: { tenantId, invoiceId: manual.id, amountCents: 150000, paymentMethod: 'Zelle' } });
    // A schedule with one milestone paid through Stripe
    const sched = await invoice(client.id, event.id, 100000, { status: 'PARTIALLY_PAID', amountPaidCents: 40000, balanceDueCents: 60000 });
    await prisma.paymentMilestone.create({ data: { tenantId, invoiceId: sched.id, label: 'Deposit', amountCents: 40000, dueDate: new Date(), status: 'PAID', paidAt: new Date(), stripePaymentIntentId: 'pi_test_1' } });
    await prisma.paymentMilestone.create({ data: { tenantId, invoiceId: sched.id, label: 'Balance', amountCents: 60000, dueDate: new Date() } });

    expect(await syncLedger(tenantId)).toEqual({ added: 3, removed: 0 });
    const rows = await prisma.ledgerTransaction.findMany({ where: { tenantId }, include: { category: true }, orderBy: { amountCents: 'desc' } });
    expect(rows.map(r => [r.type, r.amountCents, r.category?.name, r.source])).toEqual([
      ['INCOME', 150000, 'Sales', 'payment'],
      ['INCOME', 40000, 'Sales', 'payment'],
      ['EXPENSE', 4200, 'Merchant Fees', 'fee'],
    ]);
    expect(rows.every(r => r.eventId === event.id && r.clientId === client.id)).toBe(true);

    // Running again adds nothing and doesn't ask Stripe again
    expect(await syncLedger(tenantId)).toEqual({ added: 0, removed: 0 });
    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledTimes(1);

    // Undo the manual payment: its row goes away
    await prisma.payment.delete({ where: { id: pay.id } });
    await prisma.invoice.update({ where: { id: manual.id }, data: { status: 'SENT', paidAt: null, amountPaidCents: 0, balanceDueCents: 150000 } });
    expect(await syncLedger(tenantId)).toEqual({ added: 0, removed: 1 });
  });

  it('keeps the operator\'s own changes to an automatic row', async () => {
    const { client, event } = await setup();
    const inv = await invoice(client.id, event.id, 50000, { status: 'PAID', paidAt: new Date(), amountPaidCents: 50000, balanceDueCents: 0 });
    await syncLedger(tenantId);
    const row = await prisma.ledgerTransaction.findFirstOrThrow({ where: { tenantId, invoiceId: inv.id } });
    const tips = await prisma.ledgerCategory.findFirstOrThrow({ where: { tenantId, name: 'Tips' } });
    await prisma.ledgerTransaction.update({ where: { id: row.id }, data: { categoryId: tips.id, notes: 'paid at the door', verified: true } });
    await syncLedger(tenantId);
    expect(await prisma.ledgerTransaction.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ categoryId: tips.id, notes: 'paid at the door', verified: true });
  });
});

describe('Bookkeeping: refunds, print costs and event expenses', () => {
  it('adds a negative refund line, print costs from the Print Log and event expenses, and follows their changes', async () => {
    const { client, event } = await setup();
    const sched = await invoice(client.id, event.id, 100000, { status: 'PARTIALLY_PAID', amountPaidCents: 30000, balanceDueCents: 70000 });
    const deposit = await prisma.paymentMilestone.create({ data: { tenantId, invoiceId: sched.id, label: 'Deposit', amountCents: 30000, dueDate: new Date(), status: 'PAID', paidAt: new Date('2026-02-01T12:00:00Z') } });
    const profile = await prisma.consumableProfile.create({ data: { tenantId, name: 'DNP 4x6', costPerPrintCents: 25 } });
    await prisma.eventPrintLog.create({ data: { tenantId, eventId: event.id, consumableProfileId: profile.id, printCount: 300 } });
    const exp = await prisma.eventExpense.create({ data: { tenantId, eventId: event.id, description: 'Attendant', amountCents: 15000, category: 'labor' } });

    await syncLedger(tenantId);
    const rows = async () => (await prisma.ledgerTransaction.findMany({ where: { tenantId }, include: { category: true }, orderBy: { amountCents: 'desc' } }))
      .map(r => [r.source, r.type, r.amountCents, r.category?.name]);
    expect(await rows()).toEqual([
      ['payment', 'INCOME', 30000, 'Sales'],
      ['event', 'EXPENSE', 15000, 'Staff & Attendants'],
      ['print', 'EXPENSE', 7500, 'Print Media'],
    ]);

    // Cancel with a refund: the payment stays and a negative Refunds line is added
    await prisma.paymentMilestone.update({ where: { id: deposit.id }, data: { status: 'REFUNDED' } });
    // More prints logged, and the event expense removed
    await prisma.eventPrintLog.update({ where: { eventId: event.id }, data: { printCount: 400 } });
    await prisma.eventExpense.delete({ where: { id: exp.id } });
    await syncLedger(tenantId);
    expect(await rows()).toEqual([
      ['payment', 'INCOME', 30000, 'Sales'],
      ['print', 'EXPENSE', 10000, 'Print Media'],
      ['refund', 'INCOME', -30000, 'Refunds'],
    ]);

    // The P&L nets the refund out of income
    const pl = await (await REPORTS(req('/api/bookkeeping/reports?report=pl'))).json();
    expect(pl).toMatchObject({ totalIncome: 0, totalExpense: 10000, net: -10000 });
  });
});

describe('Bookkeeping: Stripe and manual refunds', () => {
  const refundRows = () => prisma.ledgerTransaction.findMany({ where: { tenantId, amountCents: { lt: 0 } }, select: { source: true, amountCents: true } });

  it('records Stripe refunds (partial ones add up) on a full-payment invoice', async () => {
    const { client, event } = await setup();
    await invoice(client.id, event.id, 100000, { status: 'PAID', paidAt: new Date(), amountPaidCents: 100000, balanceDueCents: 0, stripePaymentIntentId: 'pi_full' });
    await syncLedger(tenantId);
    expect(await recordStripeRefund('pi_full', 25000)).toBe(true);
    expect(await recordStripeRefund('pi_full', 60000)).toBe(true); // Stripe sends the running total
    expect(await refundRows()).toEqual([{ source: 'stripe-refund', amountCents: -60000 }]);
    expect(await recordStripeRefund('pi_unknown', 500)).toBe(false);
    await syncLedger(tenantId);
    expect(await refundRows()).toEqual([{ source: 'stripe-refund', amountCents: -60000 }]); // sync leaves it alone
  });

  it('counts a cancelled-event refund once, whichever arrives first', async () => {
    const { client, event } = await setup();
    const sched = await invoice(client.id, event.id, 100000, { status: 'PARTIALLY_PAID', amountPaidCents: 30000, balanceDueCents: 70000 });
    const a = await prisma.paymentMilestone.create({ data: { tenantId, invoiceId: sched.id, label: 'Deposit', amountCents: 30000, dueDate: new Date(), status: 'REFUNDED', paidAt: new Date(), stripePaymentIntentId: 'pi_a' } });
    // Cancel Event marked it refunded and Bookkeeping saw that first; then Stripe's notification arrives
    await syncLedger(tenantId);
    await recordStripeRefund('pi_a', 30000);
    expect(await refundRows()).toEqual([{ source: 'refund', amountCents: -30000 }]);

    // The other way round: Stripe's notification first, then the milestone shows as refunded
    const b = await prisma.paymentMilestone.create({ data: { tenantId, invoiceId: sched.id, label: 'Second', amountCents: 20000, dueDate: new Date(), status: 'PAID', paidAt: new Date(), stripePaymentIntentId: 'pi_b' } });
    await syncLedger(tenantId);
    await recordStripeRefund('pi_b', 20000);
    await prisma.paymentMilestone.update({ where: { id: b.id }, data: { status: 'REFUNDED' } });
    await syncLedger(tenantId);
    expect((await refundRows()).map(r => r.amountCents).sort()).toEqual([-30000, -20000].sort());
    expect(a.id).toBeTruthy();
  });

  it('records a refund given outside Stripe, up to what was paid', async () => {
    const { client, event } = await setup();
    await invoice(client.id, event.id, 50000, { status: 'PAID', paidAt: new Date(), amountPaidCents: 50000, balanceDueCents: 0 });
    await syncLedger(tenantId);
    const pay = await prisma.ledgerTransaction.findFirstOrThrow({ where: { tenantId, type: 'INCOME' } });
    const r1 = await REFUND(req('/x', { method: 'POST', body: { amountCents: 20000, date: '2026-05-01', method: 'Zelle' } }), p(pay.id));
    expect(r1.status).toBe(201);
    expect(await r1.json()).toMatchObject({ amountCents: -20000, source: 'manual', eventId: event.id, clientId: client.id });
    expect((await REFUND(req('/x', { method: 'POST', body: { amountCents: 30001, date: '2026-05-02' } }), p(pay.id))).status).toBe(400);
    expect((await REFUND(req('/x', { method: 'POST', body: { amountCents: 30000, date: '2026-05-02', method: 'Cash' } }), p(pay.id))).status).toBe(201);
    const list = await (await LIST(req('/api/bookkeeping/transactions'))).json();
    expect(list.income).toBe(0); // 500 paid, 200 + 300 refunded
  });

  it('refunds a cancelled event\'s Stripe payment from BoothGen\'s account, pulling it back from the operator', async () => {
    const { client, event } = await setup();
    const sched = await invoice(client.id, event.id, 100000, { status: 'PARTIALLY_PAID', amountPaidCents: 30000, balanceDueCents: 70000 });
    await prisma.paymentMilestone.create({ data: { tenantId, invoiceId: sched.id, label: 'Deposit', amountCents: 30000, dueDate: new Date(), status: 'PAID', paidAt: new Date(), stripePaymentIntentId: 'pi_dep' } });
    const res = await CANCEL(req('/x', { method: 'POST', body: { refundOption: 'all' } }), p(event.id));
    expect(res.status).toBe(200);
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_dep', reverse_transfer: true });
  });
});

describe('Cancel Event: refunding invoices paid in full', () => {
  it('refunds a Stripe and a non-Stripe full payment, cancels both invoices, and Bookkeeping shows each refund once', async () => {
    const { client, event } = await setup();
    const card = await invoice(client.id, event.id, 80000, { status: 'PAID', paidAt: new Date(), amountPaidCents: 80000, balanceDueCents: 0, stripePaymentIntentId: 'pi_card' });
    const cash = await invoice(client.id, event.id, 20000, { status: 'PAID', paidAt: new Date(), amountPaidCents: 20000, balanceDueCents: 0 });
    await prisma.payment.create({ data: { tenantId, invoiceId: cash.id, amountCents: 20000, paymentMethod: 'Cash' } });
    await syncLedger(tenantId);

    const res = await CANCEL(req('/x', { method: 'POST', body: { refundOption: 'all' } }), p(event.id));
    expect(res.status).toBe(200);
    expect(stripe.refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_card', reverse_transfer: true });
    expect(stripe.refunds.create).toHaveBeenCalledTimes(1); // the cash payment is refunded by the operator
    for (const inv of [card, cash]) {
      expect(await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: 'CANCELLED', balanceDueCents: 0 });
    }
    expect(await prisma.payment.findMany({ where: { invoiceId: { in: [card.id, cash.id] }, amountCents: { lt: 0 } }, select: { amountCents: true } }))
      .toEqual(expect.arrayContaining([{ amountCents: -80000 }, { amountCents: -20000 }]));

    await syncLedger(tenantId);
    // Stripe's own notification for the card refund arrives afterwards: same line, not a second one
    await recordStripeRefund('pi_card', 80000);
    const lines = await prisma.ledgerTransaction.findMany({ where: { tenantId }, select: { source: true, amountCents: true } });
    expect(lines.map(l => l.amountCents).sort((a, b) => a - b)).toEqual([-80000, -20000, 20000, 80000]);
    const list = await (await LIST(req('/api/bookkeeping/transactions'))).json();
    expect(list.income).toBe(0);
  });

  it('leaves full payments alone for "Refund deposit"', async () => {
    const { client, event } = await setup();
    await invoice(client.id, event.id, 80000, { status: 'PAID', paidAt: new Date(), amountPaidCents: 80000, balanceDueCents: 0, stripePaymentIntentId: 'pi_x' });
    vi.mocked(stripe.refunds.create).mockClear();
    expect((await CANCEL(req('/x', { method: 'POST', body: { refundOption: 'deposit' } }), p(event.id))).status).toBe(200);
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  });
});

describe('Bookkeeping API', () => {
  it('adds an expense by hand, categorizes by kind, protects BoothGen payments and reports P&L', async () => {
    const { client, event } = await setup();
    await invoice(client.id, event.id, 120000, { status: 'PAID', paidAt: new Date('2026-03-10T12:00:00Z'), amountPaidCents: 120000, balanceDueCents: 0 });
    await syncLedger(tenantId);

    const created = await CREATE(req('/api/bookkeeping/transactions', { method: 'POST', body: { type: 'EXPENSE', date: '2026-03-12', amountCents: 8999, description: 'Print media', eventId: event.id } }));
    expect(created.status).toBe(201);
    const expense = await created.json();
    expect(expense.clientId).toBe(client.id);

    const list = await (await LIST(req('/api/bookkeeping/transactions?tab=uncategorized'))).json();
    expect(list.rows.map((r: { id: string }) => r.id)).toEqual([expense.id]);
    expect(list.uncategorized).toBe(1);

    const income = await prisma.ledgerTransaction.findFirstOrThrow({ where: { tenantId, type: 'INCOME' } });
    const printMedia = await prisma.ledgerCategory.findFirstOrThrow({ where: { tenantId, name: 'Print Media' } });
    const cat = await (await BULK(req('/x', { method: 'POST', body: { ids: [expense.id, income.id], action: 'categorize', categoryId: printMedia.id } }))).json();
    expect(cat).toEqual({ count: 1, skipped: 1 }); // an expense category doesn't go on income

    expect((await DELETE_ONE(req('/x', { method: 'DELETE' }), p(income.id))).status).toBe(400);
    const del = await (await BULK(req('/x', { method: 'POST', body: { ids: [expense.id, income.id], action: 'delete' } }))).json();
    expect(del).toEqual({ count: 1, skipped: 1 });

    await CREATE(req('/api/bookkeeping/transactions', { method: 'POST', body: { type: 'EXPENSE', date: '2026-04-02', amountCents: 4500, description: 'Ads', categoryId: (await prisma.ledgerCategory.findFirstOrThrow({ where: { tenantId, name: 'Marketing' } })).id } }));
    const pl = await (await REPORTS(req('/api/bookkeeping/reports?report=pl&from=2026-01-01&to=2026-12-31'))).json();
    expect(pl).toMatchObject({ months: ['2026-03', '2026-04'], totalIncome: 120000, totalExpense: 4500, net: 115500 });
    const csv = await (await REPORTS(req('/api/bookkeeping/reports?report=transactions&format=csv'))).text();
    expect(csv.split('\n')[0]).toBe('Date,Type,Description,Payee,Category,Amount,Event,Invoice,Verified,Receipt,Notes');
  });

  it('is for account admins only', async () => {
    await setup();
    role = 'TEAM_MEMBER';
    expect((await LIST(req('/api/bookkeeping/transactions'))).status).toBe(403);
  });
});
