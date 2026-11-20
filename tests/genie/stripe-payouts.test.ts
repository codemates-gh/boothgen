import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

let session: Record<string, unknown> | null = null;
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => session) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
const createLoginLink = vi.fn(async (id: string) => ({ url: 'https://connect.stripe.com/express/login/' + id }));
vi.mock('@/lib/stripe', () => ({ stripe: { accounts: { createLoginLink: (id: string) => createLoginLink(id) } } }));

import { prisma } from '@/lib/prisma/client';
import { GET as DASHBOARD } from '@/app/api/stripe/connect/dashboard/route';
import { GET as STATUS } from '@/app/api/stripe/connect/status/route';
import { req, resetDb, seedTenant } from './helpers';

beforeEach(async () => { await resetDb(); createLoginLink.mockClear(); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

async function tenantWith(connect?: { accountType?: string; chargesEnabled?: boolean }) {
  const { tenant } = await seedTenant();
  session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', userId: 'u1' };
  if (connect) await prisma.stripeConnectAccount.create({ data: { tenantId: tenant.id, stripeAccountId: 'acct_' + tenant.id, accountType: connect.accountType ?? 'express', chargesEnabled: connect.chargesEnabled ?? true } });
  return tenant;
}
const go = async () => (await DASHBOARD(req('https://boothgen.test/api/stripe/connect/dashboard') as any)).headers.get('location');

describe('View payouts in Stripe', () => {
  it('signs an Express account in with a login link, sends a Standard account to its Stripe payouts, and an unconnected one to setup', async () => {
    const t = await tenantWith({ accountType: 'express' });
    expect(await go()).toBe('https://connect.stripe.com/express/login/acct_' + t.id);
    await prisma.stripeConnectAccount.update({ where: { tenantId: t.id }, data: { accountType: 'standard' } });
    expect(await go()).toBe('https://dashboard.stripe.com/payouts');
    await prisma.stripeConnectAccount.delete({ where: { tenantId: t.id } });
    expect(await go()).toMatch(/\/api\/stripe\/connect\/authorize$/);
  });

  it('falls back to Stripe setup when Stripe refuses a login link (onboarding not finished)', async () => {
    await tenantWith({ accountType: 'express' });
    createLoginLink.mockRejectedValueOnce(new Error('not onboarded'));
    expect(await go()).toMatch(/\/api\/stripe\/connect\/authorize$/);
  });

  it('shows the button only when Stripe is connected with charges enabled', async () => {
    const t = await tenantWith();
    expect(await (await STATUS()).json()).toEqual({ connected: false });
    await prisma.stripeConnectAccount.create({ data: { tenantId: t.id, stripeAccountId: 'acct_x' + t.id, chargesEnabled: false } });
    expect(await (await STATUS()).json()).toEqual({ connected: false });
    await prisma.stripeConnectAccount.update({ where: { tenantId: t.id }, data: { chargesEnabled: true } });
    expect(await (await STATUS()).json()).toEqual({ connected: true });
  });
});
