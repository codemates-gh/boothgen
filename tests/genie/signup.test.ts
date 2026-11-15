import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Genie-only stage 3: sign-up with email confirmation, Genie by default (docs/genie/genie-only-plan.md)

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn(async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }); }) }));
vi.mock('@/lib/tenant/seed-email-defaults', () => ({ seedTenantEmailDefaults: vi.fn(async () => ({ created: [], skipped: [] })) }));
let sessionUserId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: sessionUserId })) }));

import { prisma } from '@/lib/prisma/client';
import { authOptions } from '@/lib/auth/config';
import { POST as REGISTER } from '@/app/api/auth/register/route';
import { GET as VERIFY } from '@/app/api/auth/verify-email/route';
import { POST as RESEND } from '@/app/api/auth/resend-verification/route';
import { POST as RESET } from '@/app/api/auth/reset-password/route';
import { POST as CREATE_TENANT } from '@/app/api/onboarding/create-tenant/route';
import { verificationLink } from '@/lib/auth/emailVerification';
import { SignJWT } from 'jose';
import { req } from './helpers';

const PREFIX = 'signup-test-';
const email = () => PREFIX + randomUUID().slice(0, 8) + '@example.com';
const register = (body: Record<string, unknown>) => REGISTER(req('/api/auth/register', { method: 'POST', body: { name: 'Pat Lee', password: 'longenough1', turnstileToken: 't', ...body }, headers: { 'x-forwarded-for': randomUUID() } }));
const authorize = (e: string, password = 'longenough1') => ((authOptions.providers[1] as any).options.authorize)({ email: e, password });
const linkFrom = (html: string) => html.match(/href="([^"]+verify-email[^"]+)"/)![1].replace(/&amp;/g, '&');

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { startsWith: PREFIX } }, select: { id: true } });
  const ids = users.map(u => u.id);
  const tenants = await prisma.tenantMembership.findMany({ where: { userId: { in: ids } }, select: { tenantId: true } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants.map(t => t.tenantId) } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

beforeEach(async () => {
  await cleanup(); sent.length = 0;
  // Cloudflare Turnstile says yes
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true }))));
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

describe('email confirmation', () => {
  it('sends a confirmation link, refuses sign-in until it is clicked, then signs in to onboarding', async () => {
    const e = email();
    const res = await register({ email: e, product: 'genius' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ verify: true });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: e, subject: 'Confirm your Booth Genius email' });

    await expect(authorize(e)).rejects.toThrow('EMAIL_NOT_VERIFIED');
    expect(await authorize(e, 'wrong-password')).toBeNull(); // a wrong password says nothing about confirmation

    const link = new URL(linkFrom(sent[0].html));
    expect(link.searchParams.get('product')).toBe('crm');
    const r = await VERIFY(req(link.pathname + link.search));
    expect(r.status).toBe(307);
    const to = new URL(r.headers.get('location')!);
    expect(to.pathname).toBe('/sign-in');
    expect(to.searchParams.get('verified')).toBe('1');
    expect(to.searchParams.get('callbackUrl')).toBe('/onboarding?product=genius');
    expect(sent.map(m => m.subject)).toContain('Welcome to Booth Genius!');

    expect(await authorize(e)).toMatchObject({ email: e });
  });

  it('rejects a bad, expired or outdated link', async () => {
    const e = email();
    await register({ email: e });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: e } });
    const location = async (path: string) => new URL((await VERIFY(req(path))).headers.get('location')!).search;
    expect(await location('/api/auth/verify-email?token=nonsense')).toBe('?verify=expired');

    const expired = await new SignJWT({ userId: user.id, email: e, purpose: 'verify-email' }).setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60).sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET!));
    expect(await location('/api/auth/verify-email?token=' + expired)).toBe('?verify=expired');

    // A password-reset token isn't a confirmation link
    const reset = await new SignJWT({ userId: user.id, email: e }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET!));
    expect(await location('/api/auth/verify-email?token=' + reset)).toBe('?verify=expired');

    // The address changed since the link was sent
    const link = new URL(await verificationLink({ id: user.id, email: e }));
    await prisma.user.update({ where: { id: user.id }, data: { email: email() } });
    expect(await location(link.pathname + link.search)).toBe('?verify=expired');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeNull();
  });

  it('sends the link again only to unconfirmed email-and-password accounts', async () => {
    const e = email();
    await register({ email: e });
    sent.length = 0;
    const resend = (to: string) => RESEND(req('/x', { method: 'POST', body: { email: to }, headers: { 'x-forwarded-for': randomUUID() } }));
    expect((await resend(e.toUpperCase())).status).toBe(200);
    expect(sent).toHaveLength(1);
    await prisma.user.update({ where: { email: e }, data: { emailVerifiedAt: new Date() } });
    await resend(e);
    expect((await resend('nobody-' + e)).status).toBe(200); // same answer for unknown addresses
    expect(sent).toHaveLength(1);
  });

  it('counts Google sign-ins and password resets as confirmed', async () => {
    const g = email();
    const token = await (authOptions.callbacks!.jwt as any)({ token: { email: g, name: 'G' }, account: { provider: 'google' } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: token.userId } })).emailVerifiedAt).toBeInstanceOf(Date);

    const e = email();
    await register({ email: e });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: e } });
    const t = await new SignJWT({ userId: user.id, email: e }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('1h').sign(new TextEncoder().encode(process.env.NEXTAUTH_SECRET!));
    expect((await RESET(req('/x', { method: 'POST', body: { token: t, password: 'newpassword1' } }))).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toBeInstanceOf(Date);
  });
});

describe('onboarding', () => {
  const create = (body: Record<string, unknown>) => CREATE_TENANT(req('/x', { method: 'POST', body }));
  async function user() {
    const u = await prisma.user.create({ data: { email: email(), name: 'Pat', emailVerifiedAt: new Date() } });
    sessionUserId = u.id;
    return u;
  }
  const tenantOf = async (userId: string) => (await prisma.tenantMembership.findFirstOrThrow({ where: { userId }, include: { tenant: { include: { genieDefaults: true } } } })).tenant;

  it('makes a Genie-only account by default, with Genie on and the chosen time zone', async () => {
    const u = await user();
    expect((await create({ name: 'Snap Co', timeZone: 'America/Chicago' })).status).toBe(200);
    const t = await tenantOf(u.id);
    expect(t).toMatchObject({ product: 'genie', status: 'ACTIVE', genieEnabled: true, trialEndsAt: null });
    expect(t.genieDefaults?.timeZone).toBe('America/Chicago');
  });

  it('makes a Genius account with the free trial when chosen', async () => {
    const u = await user();
    expect((await create({ name: 'Snap Co', product: 'genius' })).status).toBe(200);
    const t = await tenantOf(u.id);
    expect(t).toMatchObject({ product: 'crm', status: 'TRIAL', genieEnabled: false });
    expect(t.trialEndsAt).toBeInstanceOf(Date);
  });

  it('refuses an unknown time zone and a second account', async () => {
    await user();
    expect((await create({ name: 'Snap Co', timeZone: 'Mars/Base' })).status).toBe(400);
    expect((await create({ name: 'Snap Co' })).status).toBe(200);
    expect((await create({ name: 'Second Co' })).status).toBe(409);
  });
});
