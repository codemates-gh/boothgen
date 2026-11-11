import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

let tenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));
vi.mock('@/lib/inngest/trigger', () => ({ triggerAutomation: vi.fn(async () => {}) }));
vi.mock('@/lib/email/send', () => ({ sendInvoiceLink: vi.fn(async () => ({})), sendPaymentConfirmationEmail: vi.fn(async () => ({})), sendEmail: vi.fn(async () => ({})) }));
vi.mock('@/lib/stripe', () => ({ stripe: { paymentIntents: { retrieve: vi.fn() } } }));

import { prisma } from '@/lib/prisma/client';
import { POST as MARK_PAID } from '@/app/api/invoices/[id]/mark-paid/route';
import { POST as UNMARK_PAID } from '@/app/api/invoices/[id]/unmark-paid/route';
import { POST as SEND } from '@/app/api/invoices/[id]/send/route';
import { GET as PORTAL } from '@/app/api/portal/[portalToken]/route';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const p = (id: string) => ({ params: { id } });
const post = (body: unknown = {}) => req('/x', { method: 'POST', body });

async function invoice(tid: string, clientId: string, eventId: string, totalCents: number, opts: { status?: 'DRAFT' | 'SENT'; milestones?: number[] } = {}) {
  return prisma.invoice.create({
    data: {
      tenantId: tid, clientId, eventId, invoiceNumber: 'INV-' + randomUUID().slice(0, 6), status: opts.status ?? 'SENT',
      subtotalCents: totalCents, totalCents, balanceDueCents: totalCents,
      ...(opts.milestones ? { PaymentMilestone: { create: opts.milestones.map((a, i) => ({ tenantId: tid, label: 'Part ' + (i + 1), amountCents: a, dueDate: new Date() })) } } : {}),
    },
  });
}

async function setup(pro = true) {
  const { tenant, client } = await seedTenant({ pro });
  tenantId = tenant.id;
  const event = await seedEvent(tenant.id, client.id, { status: 'LEAD', settings: false, templates: 0 });
  return { tenant, client, event };
}

beforeEach(resetDb);
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Mark a full-payment invoice paid', () => {
  it('marks it paid, books the event, and can be undone', async () => {
    const { client, event } = await setup();
    const inv = await invoice(tenantId, client.id, event.id, 150000);

    const r = await MARK_PAID(post({ paymentMethod: 'Zelle' }), p(inv.id));
    expect(r.status).toBe(200);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: 'PAID', amountPaidCents: 150000, balanceDueCents: 0 });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).paidAt).not.toBeNull();
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('BOOKED');
    expect(await prisma.payment.findFirst({ where: { invoiceId: inv.id } })).toMatchObject({ amountCents: 150000, paymentMethod: 'Zelle' });
    expect((await MARK_PAID(post(), p(inv.id))).status).toBe(400); // already paid

    expect((await UNMARK_PAID(post(), p(inv.id))).status).toBe(200);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: 'SENT', amountPaidCents: 0, balanceDueCents: 150000, paidAt: null });
    expect(await prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(0);
  });

  it('needs a paid plan, sends schedule invoices to their milestones, and leaves Stripe payments alone', async () => {
    const { client, event } = await setup(false);
    const inv = await invoice(tenantId, client.id, event.id, 1000);
    expect((await MARK_PAID(post(), p(inv.id))).status).toBe(403);

    const pro = await setup();
    const scheduled = await invoice(tenantId, pro.client.id, pro.event.id, 1000, { milestones: [500, 500] });
    expect((await MARK_PAID(post(), p(scheduled.id))).status).toBe(400);

    // Paid through Stripe (no manual payment row): undo is refused
    const viaStripe = await invoice(tenantId, pro.client.id, pro.event.id, 1000);
    await prisma.invoice.update({ where: { id: viaStripe.id }, data: { status: 'PAID', paidAt: new Date(), amountPaidCents: 1000, balanceDueCents: 0, stripePaymentIntentId: 'pi_x' } });
    expect((await UNMARK_PAID(post(), p(viaStripe.id))).status).toBe(400);

    // Another account's invoice
    const other = await seedTenant();
    tenantId = other.tenant.id;
    expect((await MARK_PAID(post(), p(inv.id))).status).toBe(404);
  });
});

describe('$0 invoices', () => {
  it('are paid as soon as they are sent, milestones included', async () => {
    const { client, event } = await setup();
    const inv = await invoice(tenantId, client.id, event.id, 0, { status: 'DRAFT', milestones: [0, 0] });
    expect((await SEND(post(), p(inv.id))).status).toBeLessThan(400); // redirects back to the invoice
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({ status: 'PAID', balanceDueCents: 0 });
    expect(await prisma.paymentMilestone.count({ where: { invoiceId: inv.id, status: { not: 'PAID' } } })).toBe(0);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe('BOOKED');
  });

  it('already sent ones settle when the client opens the portal; paid invoices with a balance are untouched', async () => {
    const { client, event } = await setup();
    const zero = await invoice(tenantId, client.id, event.id, 0);
    const { portalToken } = await prisma.event.findUniqueOrThrow({ where: { id: event.id }, select: { portalToken: true } });
    const d = await (await PORTAL(req('/x'), { params: { portalToken } })).json();
    expect(d.invoice).toMatchObject({ id: zero.id, status: 'PAID', balanceDueCents: 0 });

    const draft = await invoice(tenantId, client.id, event.id, 0, { status: 'DRAFT' });
    const owed = await invoice(tenantId, client.id, event.id, 2500);
    await PORTAL(req('/x'), { params: { portalToken } });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('DRAFT');
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: owed.id } })).status).toBe('SENT');
  });
});
