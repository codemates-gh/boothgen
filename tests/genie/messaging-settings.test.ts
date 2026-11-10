import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));

import { prisma } from '@/lib/prisma/client';
import { decryptSecret } from '@/lib/crypto/secrets';
import { GET, PUT } from '@/app/api/settings/genie-messaging/route';
import { POST as TEST } from '@/app/api/settings/genie-messaging/test/route';
import { resetDb, seedTenant } from './helpers';

const put = (body: unknown) => PUT(new NextRequest('https://boothgen.test/api/settings/genie-messaging', { method: 'PUT', body: JSON.stringify(body) }));
const SID = 'AC' + 'c'.repeat(32);

beforeEach(async () => { vi.restoreAllMocks(); await resetDb(); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Genie messaging settings', () => {
  it('encrypts secrets, returns them masked, and keeps them when left blank', async () => {
    const { tenant } = await seedTenant({ messaging: false });
    sessionTenantId = tenant.id;
    const r1 = await put({ sms: { accountSid: SID, authToken: 'tok_secret_1234', fromNumber: '+14155550100' } });
    expect(r1.status).toBe(200);
    const body = JSON.stringify(await r1.json());
    expect(body).not.toContain('tok_secret_1234');
    expect(body).toContain('1234');

    const stored = await prisma.genieMessagingConfig.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    expect(stored.twilioAuthTokenEnc).not.toContain('tok_secret');
    expect(decryptSecret(stored.twilioAuthTokenEnc!)).toBe('tok_secret_1234');

    await put({ sms: { accountSid: SID, authToken: '', fromNumber: '+14155550199' } });
    const after = await prisma.genieMessagingConfig.findUniqueOrThrow({ where: { tenantId: tenant.id } });
    expect(decryptSecret(after.twilioAuthTokenEnc!)).toBe('tok_secret_1234');
    expect(after.twilioFromNumber).toBe('+14155550199');

    const got = await (await GET()).json();
    expect(got.sms).toMatchObject({ configured: true, accountSid: SID });
    expect(JSON.stringify(got)).not.toContain('tok_secret');
  });

  it('requires the Genie add-on', async () => {
    const { tenant } = await seedTenant({ genieEnabled: false, messaging: false });
    sessionTenantId = tenant.id;
    expect((await GET()).status).toBe(403);
  });

  it('validates SMTP and Resend input', async () => {
    const { tenant } = await seedTenant({ messaging: false });
    sessionTenantId = tenant.id;
    expect((await put({ email: { provider: 'resend', fromAddress: 'a@b.co' } })).status).toBe(400);
    expect((await put({ email: { provider: 'smtp', fromAddress: 'a@b.co', smtpHost: 'smtp.b.co' } })).status).toBe(400);
    const ok = await put({ email: { provider: 'smtp', fromAddress: 'a@b.co', smtpHost: 'smtp.b.co', smtpPort: 587, smtpSecurity: 'starttls', smtpUsername: 'u', smtpPassword: 'pw' } });
    expect((await ok.json()).email).toMatchObject({ configured: true, provider: 'smtp', smtpPasswordMasked: expect.any(String) });
  });

});

describe('Resend From domain check', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const domains = (list: { name: string; status: string }[]) => json(200, { object: 'list', data: list.map((d, i) => ({ id: 'd' + i, region: 'us-east-1', created_at: '2026-01-01', ...d })) });
  const resendEmail = (fromAddress: string, key = 're_full_key') => ({ email: { provider: 'resend', fromName: 'Instant Photo Box', fromAddress, resendApiKey: key } });
  const sendTest = () => TEST(new NextRequest('https://boothgen.test/api/settings/genie-messaging/test', { method: 'POST', body: JSON.stringify({ channel: 'email', to: 'guest@example.com' }) }));

  async function tenant() {
    const { tenant } = await seedTenant({ messaging: false });
    sessionTenantId = tenant.id;
    return tenant;
  }

  it('accepts a From address on a domain verified in the tenant\'s Resend account', async () => {
    await tenant();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      expect(String(input)).toBe('https://api.resend.com/domains');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer re_full_key');
      return domains([{ name: 'other.com', status: 'not_started' }, { name: 'instantphotobox.com', status: 'verified' }]);
    });
    const r = await put(resendEmail('photos@InstantPhotoBox.com'));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ email: { configured: true, fromAddress: 'photos@InstantPhotoBox.com' }, notice: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a domain that is missing or not yet verified in Resend', async () => {
    const t = await tenant();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => domains([{ name: 'pending.com', status: 'pending' }]));
    const missing = await put(resendEmail('info@instantphotobox.com'));
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe("instantphotobox.com isn't verified in your Resend account. Add it under Resend → Domains, or use an address on a verified domain.");
    const pending = await put(resendEmail('info@pending.com'));
    expect(pending.status).toBe(400);
    expect((await pending.json()).error).toContain("pending.com isn't verified in your Resend account yet (status: pending)");
    expect(await prisma.genieMessagingConfig.findUnique({ where: { tenantId: t.id } })).toBeNull();
  });

  it('re-checks the domain on Send test and does not send when it is unverified', async () => {
    const t = await tenant();
    let verified = true;
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      calls.push(String(input));
      return domains([{ name: 'instantphotobox.com', status: verified ? 'verified' : 'failed' }]);
    });
    expect((await put(resendEmail('photos@instantphotobox.com'))).status).toBe(200);
    verified = false; // removed / failed in Resend after saving
    const r = await sendTest();
    expect(r.status).toBe(422);
    expect((await r.json()).error).toContain("instantphotobox.com isn't verified in your Resend account yet");
    expect(calls.every(u => u.endsWith('/domains'))).toBe(true);
    const saved = await prisma.genieMessagingConfig.findUniqueOrThrow({ where: { tenantId: t.id } });
    expect(saved.emailTestError).toContain("isn't verified");
  });

  it('always refuses boothgen.com and its subdomains, whatever Resend says', async () => {
    await tenant();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => domains([{ name: 'boothgen.com', status: 'verified' }, { name: 'mail.boothgen.com', status: 'verified' }]));
    for (const from of ['info@boothgen.com', 'photos@mail.BoothGen.com']) {
      const r = await put(resendEmail(from));
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/You can't send from .*boothgen\.com\. Use an address on your own domain\./);
    }
    const smtp = await put({ email: { provider: 'smtp', fromAddress: 'info@boothgen.com', smtpHost: 'smtp.b.co', smtpPort: 587, smtpSecurity: 'starttls', smtpUsername: 'u', smtpPassword: 'pw' } });
    expect(smtp.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    // not fooled by look-alikes
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => domains([{ name: 'notboothgen.com', status: 'verified' }]));
    expect((await put(resendEmail('a@notboothgen.com'))).status).toBe(200);
  });

  it('skips the check when the key cannot list domains and explains Resend\'s error on Send test', async () => {
    await tenant();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.endsWith('/domains')) return json(401, { statusCode: 401, name: 'restricted_api_key', message: 'This API key is restricted to only send emails' });
      return json(403, { statusCode: 403, name: 'validation_error', message: 'The instantphotobox.com domain is not verified. Please, add and verify your domain on https://resend.com/domains' });
    });
    const saved = await put(resendEmail('info@instantphotobox.com', 're_send_only'));
    expect(saved.status).toBe(200);
    const body = await saved.json();
    expect(body.email.configured).toBe(true);
    expect(body.notice).toContain("can't list domains");
    expect(body.notice).toContain('full access');

    const r = await sendTest();
    expect(r.status).toBe(422);
    const err = (await r.json()).error as string;
    expect(err).toContain('Resend said: The instantphotobox.com domain is not verified');
    expect(err).toContain('full access');
  });
});
