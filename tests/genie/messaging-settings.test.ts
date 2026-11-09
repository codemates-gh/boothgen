import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));

import { prisma } from '@/lib/prisma/client';
import { decryptSecret } from '@/lib/crypto/secrets';
import { GET, PUT } from '@/app/api/settings/genie-messaging/route';
import { resetDb, seedTenant } from './helpers';

const put = (body: unknown) => PUT(new NextRequest('https://boothgen.test/api/settings/genie-messaging', { method: 'PUT', body: JSON.stringify(body) }));
const SID = 'AC' + 'c'.repeat(32);

beforeEach(resetDb);
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
