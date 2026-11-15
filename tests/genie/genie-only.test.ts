import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Genie-only accounts, stage 1: access rules, middleware, Super Admin switch, sign-in token (docs/genie/genie-only-plan.md)

let jwtToken: Record<string, unknown> | null = null;
vi.mock('next-auth/jwt', () => ({ getToken: vi.fn(async () => jwtToken) }));
let globalRole = 'SUPER_ADMIN';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: 't-admin', tenantRole: 'HOST_ADMIN', globalRole })) }));
vi.mock('@/lib/tenant/cleanup', () => ({ deleteTenant: vi.fn() }));

import { prisma } from '@/lib/prisma/client';
import { genieOnlyBlock, settingsTabs, isGenieOnly } from '@/lib/product';
import { middleware } from '@/middleware';
import { PATCH } from '@/app/api/super-admin/tenants/[id]/route';
import { authOptions } from '@/lib/auth/config';
import { req, resetDb, seedTenant } from './helpers';

beforeEach(resetDb);
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Genie-only access rules', () => {
  it('sends the dashboard to booth events and blocks CRM pages', () => {
    expect(genieOnlyBlock('/dashboard')).toEqual({ kind: 'home' });
    for (const p of ['/clients', '/clients/abc', '/leads', '/quotes/new', '/invoices', '/contracts', '/calendar', '/messages',
      '/automation', '/analytics', '/events', '/events/abc', '/events/abc/designs', '/events/abc/edit',
      '/settings/packages', '/settings/team', '/settings/billing', '/settings/import']) {
      expect(genieOnlyBlock(p), p).toEqual({ kind: 'page' });
    }
  });

  it('keeps the booth, designs, galleries and a short settings open', () => {
    for (const p of ['/genie/events', '/genie/defaults', '/genie/props', '/genie/backdrops', '/genie/devices', '/genie/sharing',
      '/events/abc/genie', '/templates', '/templates/xyz', '/templates/settings', '/gallery', '/gallery/abc',
      '/settings/branding', '/settings/profile', '/reports', '/upgrade', '/eventsy']) {
      expect(genieOnlyBlock(p), p).toBeNull();
    }
  });

  it('blocks CRM APIs and keeps Genie APIs open', () => {
    for (const p of ['/api/clients', '/api/leads/x', '/api/quotes', '/api/invoices/x/send', '/api/events', '/api/events/abc',
      '/api/events/abc/notes', '/api/search', '/api/settings/packages', '/api/stripe/connect/onboard']) {
      expect(genieOnlyBlock(p), p).toEqual({ kind: 'api' });
    }
    for (const p of ['/api/events/abc/genie', '/api/events/abc/genie/bundle', '/api/genie-events', '/api/genie-props',
      '/api/genie-templates', '/api/gallery', '/api/settings/branding', '/api/settings/profile', '/api/settings/genie-messaging',
      '/api/reports', '/api/notifications', '/api/template-library/hidden', '/api/stripe/billing/checkout']) {
      expect(genieOnlyBlock(p), p).toBeNull();
    }
  });

  it('shows Genie-only accounts only the settings tabs they can open', () => {
    expect(settingsTabs('genie').map(([h]) => h)).toEqual(['branding', 'profile']);
    expect(settingsTabs('crm')).toHaveLength(10);
    expect(isGenieOnly({ product: 'genie' })).toBe(true);
    expect(isGenieOnly({ product: 'crm' })).toBe(false);
    expect(isGenieOnly(null)).toBe(false);
  });
});

describe('middleware', () => {
  const run = (path: string) => middleware(req(path));
  const genie = { userId: 'u1', tenantId: 't1', tenantRole: 'HOST_ADMIN', tenantProduct: 'genie' };

  it('redirects a Genie-only operator away from CRM pages and the dashboard', async () => {
    jwtToken = genie;
    let res = await run('/clients/abc');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://boothgen.test/upgrade?from=%2Fclients%2Fabc');
    res = await run('/dashboard');
    expect(res.headers.get('location')).toBe('https://boothgen.test/genie/events');
  });

  it('refuses CRM APIs with genius_required', async () => {
    jwtToken = genie;
    const res = await run('/api/invoices');
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('genius_required');
  });

  it('lets Genie pages and APIs through, with the path for the layout', async () => {
    jwtToken = genie;
    for (const p of ['/genie/events', '/events/abc/genie', '/api/events/abc/genie/bundle', '/templates']) {
      const res = await run(p);
      expect(res.headers.get('location'), p).toBeNull();
      expect(res.status, p).toBe(200);
      expect(res.headers.get('x-middleware-request-x-pathname'), p).toBe(p);
    }
  });

  it('leaves Genius (CRM) accounts and old tokens without a product alone', async () => {
    for (const t of [{ ...genie, tenantProduct: 'crm' }, { userId: 'u1', tenantId: 't1', tenantRole: 'HOST_ADMIN' }]) {
      jwtToken = t;
      for (const p of ['/clients', '/dashboard', '/api/invoices']) {
        const res = await run(p);
        expect(res.status, p).toBe(200);
        expect(res.headers.get('location'), p).toBeNull();
      }
    }
  });
});

describe('Super Admin product switch', () => {
  const patch = (id: string, body: unknown) => PATCH(req('/x', { method: 'PATCH', body }), { params: { id } });

  it('makes an account Genie only (turning Genie on) and back, keeping Genie on', async () => {
    const { tenant } = await seedTenant({ genieEnabled: false });
    globalRole = 'SUPER_ADMIN';
    expect((await patch(tenant.id, { product: 'genie' })).status).toBe(200);
    let t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(t.product).toBe('genie');
    expect(t.genieEnabled).toBe(true);
    expect(t.genieEnabledAt).toBeInstanceOf(Date);

    // A Genie-only account can't turn Genie off
    expect((await patch(tenant.id, { genieEnabled: false })).status).toBe(409);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).genieEnabled).toBe(true);

    expect((await patch(tenant.id, { product: 'crm' })).status).toBe(200);
    t = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
    expect(t.product).toBe('crm');
    expect(t.genieEnabled).toBe(true);
  });

  it('refuses unknown products and non super admins', async () => {
    const { tenant } = await seedTenant();
    globalRole = 'SUPER_ADMIN';
    expect((await patch(tenant.id, { product: 'pro' })).status).toBe(400);
    globalRole = 'USER';
    expect((await patch(tenant.id, { product: 'genie' })).status).toBe(403);
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).product).toBe('crm');
    globalRole = 'SUPER_ADMIN';
  });
});

describe('sign-in token', () => {
  async function member(product: string) {
    const { tenant } = await seedTenant();
    await prisma.tenant.update({ where: { id: tenant.id }, data: { product } });
    const user = await prisma.user.create({ data: { email: tenant.id + '@example.com', name: 'Op' } });
    await prisma.tenantMembership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'HOST_ADMIN', status: 'ACTIVE' } });
    return { tenant, user };
  }
  const jwt = (token: any, trigger?: string) => (authOptions.callbacks!.jwt as any)({ token, trigger });

  it('carries the product into the token and the session', async () => {
    const { user } = await member('genie');
    const token = await jwt({ userId: user.id, globalRole: 'USER' }, 'update');
    expect(token.tenantProduct).toBe('genie');
    const session = await (authOptions.callbacks!.session as any)({ session: {}, token });
    expect(session.tenant.product).toBe('genie');
  });

  it('re-reads the account after five minutes, not before', async () => {
    const { tenant, user } = await member('crm');
    const fresh = { userId: user.id, globalRole: 'USER', tenantId: tenant.id, tenantProduct: 'crm', tenantRefreshedAt: Date.now() };
    await prisma.tenant.update({ where: { id: tenant.id }, data: { product: 'genie' } });
    expect((await jwt({ ...fresh })).tenantProduct).toBe('crm');
    expect((await jwt({ ...fresh, tenantRefreshedAt: Date.now() - 6 * 60 * 1000 })).tenantProduct).toBe('genie');
    // Tokens issued before this change have no refresh time: re-read on the next request
    const { tenantRefreshedAt: _, ...old } = fresh;
    expect((await jwt(old)).tenantProduct).toBe('genie');
  });
});
