import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Stage 4: Genius needs Genius Pro (src/lib/genius.ts)

const sent: { to: string; subject: string }[] = [];
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async (to: string, subject: string) => { sent.push({ to, subject }); }) }));
let globalRole = 'SUPER_ADMIN';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: 't-admin', tenantRole: 'HOST_ADMIN', globalRole })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/tenant/cleanup', () => ({ deleteTenant: vi.fn() }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn() } }));

import { prisma } from '@/lib/prisma/client';
import { RULE_SETTING, accountsLosingGenius, enforceGenius, geniusReason, restoreGeniusIfPaid } from '@/lib/genius';
import { GET as RULE, PUT as SET_RULE } from '@/app/api/super-admin/genius-rule/route';
import { PATCH as TENANT } from '@/app/api/super-admin/tenants/[id]/route';
import { GET as PORTAL } from '@/app/api/portal/[portalToken]/route';
import { GET as AVAILABILITY } from '@/app/api/public/[tenantSlug]/availability/route';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const DAY = 86400_000;
async function account(opts: { plan?: 'MONTHLY' | 'LIFETIME'; subStatus?: 'ACTIVE' | 'CANCELLED'; trialDays?: number; free?: boolean } = {}) {
  const { tenant, client } = await seedTenant({ pro: false });
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      geniusFree: !!opts.free,
      ...(opts.trialDays !== undefined ? { status: 'TRIAL', trialEndsAt: new Date(Date.now() + opts.trialDays * DAY) } : { status: 'ACTIVE' }),
      ...(opts.plan ? { stripeSubscription: { create: { plan: opts.plan, status: opts.subStatus ?? 'ACTIVE', stripeCustomerId: 'cus_' + randomUUID() } } } : {}),
    },
  });
  const user = await prisma.user.create({ data: { email: 'owner-' + randomUUID() + '@example.com', name: 'Owner' } });
  await prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'HOST_ADMIN', status: 'ACTIVE' } });
  return { tenant, client, user };
}
const product = async (id: string) => (await prisma.tenant.findUniqueOrThrow({ where: { id } })).product;
const ruleOn = (on: boolean) => prisma.systemSetting.upsert({ where: { key: RULE_SETTING }, update: { value: on ? 'on' : 'off' }, create: { key: RULE_SETTING, value: on ? 'on' : 'off' } });

beforeEach(async () => {
  await resetDb(); sent.length = 0; globalRole = 'SUPER_ADMIN';
  await prisma.systemSetting.deleteMany({ where: { key: RULE_SETTING } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'owner-' } } });
});
afterAll(async () => {
  await resetDb();
  await prisma.systemSetting.deleteMany({ where: { key: RULE_SETTING } });
  await prisma.user.deleteMany({ where: { email: { startsWith: 'owner-' } } });
  await prisma.$disconnect();
});

describe('who keeps Genius', () => {
  const base = { product: 'crm', status: 'ACTIVE', trialEndsAt: null, geniusFree: false, stripeSubscription: null };
  it('keeps Pro, lifetime, a running trial and Keep Genius free; not the free commission plan or an ended trial', () => {
    expect(geniusReason({ ...base, stripeSubscription: { plan: 'MONTHLY', status: 'ACTIVE' } })).toBe('pro');
    expect(geniusReason({ ...base, stripeSubscription: { plan: 'ANNUAL', status: 'PAST_DUE' } })).toBe('pro');
    expect(geniusReason({ ...base, stripeSubscription: { plan: 'LIFETIME', status: 'ACTIVE' } })).toBe('lifetime');
    expect(geniusReason({ ...base, status: 'TRIAL', trialEndsAt: new Date(Date.now() + DAY) })).toBe('trial');
    expect(geniusReason({ ...base, geniusFree: true })).toBe('free');
    expect(geniusReason(base)).toBeNull();
    expect(geniusReason({ ...base, stripeSubscription: { plan: 'MONTHLY', status: 'CANCELLED' } })).toBeNull();
    expect(geniusReason({ ...base, stripeSubscription: { plan: 'FREE_TRIAL', status: 'TRIALING' } })).toBeNull();
    expect(geniusReason({ ...base, status: 'TRIAL', trialEndsAt: new Date(Date.now() - DAY) })).toBeNull();
  });
});

describe('the rule', () => {
  it('does nothing while off; when on, moves accounts without Pro to Genie only and emails the owner', async () => {
    const free = await account();
    const ended = await account({ trialDays: -1 });
    const pro = await account({ plan: 'MONTHLY' });
    const life = await account({ plan: 'LIFETIME' });
    const trial = await account({ trialDays: 5 });
    const kept = await account({ free: true });
    const exec = await prisma.automationRule.create({ data: { tenantId: free.tenant.id, name: 'Follow up', trigger: 'LEAD_CREATED', delayMinutes: 0, actionType: 'EMAIL' } as any }).catch(() => null);

    expect(await enforceGenius()).toBe(0);
    expect(await product(free.tenant.id)).toBe('crm');
    const losing = (await accountsLosingGenius()).map(t => t.id);
    expect(losing).toEqual(expect.arrayContaining([free.tenant.id, ended.tenant.id]));
    for (const t of [pro, life, trial, kept]) expect(losing).not.toContain(t.tenant.id);

    await ruleOn(true);
    expect(await enforceGenius()).toBeGreaterThanOrEqual(2);
    expect(await product(free.tenant.id)).toBe('genie');
    expect(await product(ended.tenant.id)).toBe('genie');
    for (const t of [pro, life, trial, kept]) expect(await product(t.tenant.id)).toBe('crm');
    const switched = await prisma.tenant.findUniqueOrThrow({ where: { id: free.tenant.id } });
    expect(switched.genieEnabled).toBe(true);
    expect(sent.map(m => m.to)).toEqual(expect.arrayContaining([free.user.email, ended.user.email]));
    expect(sent.find(m => m.to === free.user.email)!.subject).toContain('is now on Genie');
    void exec;
  });

  it('brings the CRM back when a Genie-only account subscribes to Pro', async () => {
    const a = await account();
    await prisma.tenant.update({ where: { id: a.tenant.id }, data: { product: 'genie' } });
    expect(await restoreGeniusIfPaid(a.tenant.id)).toBe(false);
    await prisma.stripeSubscription.create({ data: { tenantId: a.tenant.id, plan: 'MONTHLY', status: 'ACTIVE', stripeCustomerId: 'cus_' + randomUUID() } });
    expect(await restoreGeniusIfPaid(a.tenant.id)).toBe(true);
    expect(await product(a.tenant.id)).toBe('crm');
  });
});

describe('the CRM closes to clients', () => {
  it('portal links and lead capture say no longer available', async () => {
    const a = await account();
    await prisma.tenantBranding.create({ data: { tenantId: a.tenant.id, companyName: 'Snap Co' } });
    const event = await seedEvent(a.tenant.id, a.client.id);
    expect((await PORTAL(req('/x'), { params: { portalToken: event.portalToken } })).status).toBe(200);
    await prisma.tenant.update({ where: { id: a.tenant.id }, data: { product: 'genie' } });
    const res = await PORTAL(req('/x'), { params: { portalToken: event.portalToken } });
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ code: 'no_longer_available', companyName: 'Snap Co' });
    const avail = await AVAILABILITY(req(`/api/public/${a.tenant.slug}/availability?date=2027-01-01`), { params: { tenantSlug: a.tenant.slug } });
    expect((await avail.json()).available).toBe(false);
  });
});

describe('Super Admin', () => {
  it('previews, turns the rule on (moving accounts now) and off, and keeps Genius free per account', async () => {
    const a = await account();
    const b = await account();
    expect((await TENANT(req('/x', { method: 'PATCH', body: { geniusFree: true } }), { params: { id: b.tenant.id } })).status).toBe(200);

    let d = await (await RULE()).json();
    expect(d.on).toBe(false);
    expect(d.losing.map((l: any) => l.id)).toContain(a.tenant.id);
    expect(d.losing.map((l: any) => l.id)).not.toContain(b.tenant.id);

    d = await (await SET_RULE(req('/x', { method: 'PUT', body: { on: true } }))).json();
    expect(d.on).toBe(true);
    expect(d.switched).toBeGreaterThanOrEqual(1);
    expect(await product(a.tenant.id)).toBe('genie');
    expect(await product(b.tenant.id)).toBe('crm');

    expect((await (await SET_RULE(req('/x', { method: 'PUT', body: { on: false } }))).json()).switched).toBe(0);
    globalRole = 'USER';
    expect((await RULE()).status).toBe(401);
  });
});
