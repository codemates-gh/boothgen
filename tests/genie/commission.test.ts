import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

const created: any[] = [];
let existing: any = null;
vi.mock('@/lib/stripe', () => ({
  stripe: {
    paymentIntents: {
      create: vi.fn(async (args: any) => { created.push(args); return { id: 'pi_' + randomUUID(), client_secret: 'secret_new' }; }),
      retrieve: vi.fn(async () => existing),
    },
  },
}));

import { prisma } from '@/lib/prisma/client';
import { POST } from '@/app/api/public/stripe/payment-intent/route';
import { req, resetDb, seedTenant } from './helpers';

// Commission on client invoice payments: none for Genius Pro or "Keep Genius free" accounts
async function invoiceFor(opts: { geniusFree: boolean; lifetime?: boolean }) {
  const { tenant, client } = await seedTenant({ pro: !!opts.lifetime, messaging: false });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { geniusFree: opts.geniusFree } });
  await prisma.stripeConnectAccount.create({ data: { tenantId: tenant.id, stripeAccountId: 'acct_' + randomUUID(), onboardingStatus: 'ACTIVE', chargesEnabled: true } });
  return prisma.invoice.create({ data: { tenantId: tenant.id, clientId: client.id, invoiceNumber: 'INV-1', status: 'SENT', totalCents: 10_000, balanceDueCents: 10_000 } });
}

const pay = (invoiceId: string) => POST(req('/x', { method: 'POST', body: { invoiceId } }) as any);

beforeEach(async () => { await resetDb(); created.length = 0; existing = null; });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('commission on invoice payments', () => {
  it('charges commission without Pro, none for Keep Genius free or lifetime', async () => {
    const paying = await invoiceFor({ geniusFree: false });
    expect((await pay(paying.id)).status).toBe(200);
    expect(created[0].application_fee_amount).toBeGreaterThan(0);

    const free = await invoiceFor({ geniusFree: true });
    expect((await pay(free.id)).status).toBe(200);
    expect(created[1].application_fee_amount).toBeUndefined();

    const lifetime = await invoiceFor({ geniusFree: false, lifetime: true });
    expect((await pay(lifetime.id)).status).toBe(200);
    expect(created[2].application_fee_amount).toBeUndefined();
  });

  it('replaces an unpaid payment made with a commission once the account is free', async () => {
    const inv = await invoiceFor({ geniusFree: true });
    await prisma.invoice.update({ where: { id: inv.id }, data: { stripePaymentIntentId: 'pi_old' } });
    existing = { id: 'pi_old', status: 'requires_payment_method', client_secret: 'secret_old', application_fee_amount: 150 };
    expect(await (await pay(inv.id)).json()).toEqual({ clientSecret: 'secret_new' });
    expect(created[0].application_fee_amount).toBeUndefined();

    existing = { id: 'pi_ok', status: 'requires_payment_method', client_secret: 'secret_ok', application_fee_amount: null };
    expect(await (await pay(inv.id)).json()).toEqual({ clientSecret: 'secret_ok' });
  });
});
