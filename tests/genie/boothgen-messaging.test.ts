import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';

// Genie-only stage 2c: guest texts and emails through BoothGen's own Twilio and Resend (docs/genie/genie-only-plan.md)

const resendSend = vi.fn();
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation((key: string) => ({ emails: { send: (msg: unknown) => resendSend(key, msg) } })) }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));
let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));

import { prisma } from '@/lib/prisma/client';
import { twilioSignature } from '@/lib/sms/twilio';
import { BOOTHGEN_SMS_LIMIT_PER_EVENT, messagingRoutes } from '@/lib/genie/messaging';
import { deliverShare, prepareShare, recordShareResult } from '@/lib/genie/shares';
import { buildEventBundle } from '@/lib/genie/bundle';
import { POST as twilioWebhook } from '@/app/api/webhooks/twilio/genie/[tenantId]/route';
import { GET as GET_SETTINGS, PUT as PUT_SETTINGS } from '@/app/api/settings/genie-messaging/route';
import { guestSession, req, resetDb, seedEvent, seedTenant } from './helpers';

const ENV = {
  BOOTHGEN_TWILIO_ACCOUNT_SID: 'AC' + 'c'.repeat(32), BOOTHGEN_TWILIO_AUTH_TOKEN: 'platform-token', BOOTHGEN_TWILIO_MESSAGING_SERVICE_SID: 'MG' + 'd'.repeat(32),
  BOOTHGEN_RESEND_API_KEY: 're_platform', BOOTHGEN_EMAIL_FROM: 'photos@mail.boothgen.test',
};
const fetchMock = vi.fn();

beforeEach(async () => {
  await resetDb();
  resendSend.mockReset(); fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

async function genieOnly(opts: { messaging?: boolean } = {}) {
  const { tenant, client } = await seedTenant({ messaging: opts.messaging ?? false });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { product: 'genie' } });
  sessionTenantId = tenant.id;
  return { tenant: { ...tenant, product: 'genie' }, client };
}

async function seedShare(tenantId: string, clientId: string, channel: 'sms' | 'email') {
  const event = await seedEvent(tenantId, clientId);
  const gallery = await prisma.gallery.create({ data: { tenantId, eventId: event.id, title: 'G' } });
  const s = guestSession();
  const session = await prisma.genieSession.create({ data: { tenantId, eventId: event.id, galleryId: gallery.id, clientId: s.id, publicToken: s.publicToken, startedAt: new Date() } });
  await prisma.galleryAsset.create({ data: { galleryId: gallery.id, genieSessionId: session.id, clientId: randomUUID(), assetType: 'PHOTO', url: 'https://media.boothgen.test/x.jpg', filename: 'x.jpg', fileSizeBytes: 1, mimeType: 'image/jpeg', approvalStatus: 'APPROVED' } });
  const share = await prisma.genieShare.create({
    data: { tenantId, eventId: event.id, sessionId: session.id, clientId: randomUUID(), channel, destination: channel === 'sms' ? '+14155550123' : 'sam@example.com', firstName: 'Sam', smsConsentAt: new Date(), requestedAt: new Date() },
  });
  return { event, session, share };
}

async function send(shareId: string) {
  const p = await prepareShare(shareId);
  if (!p.ready) throw new Error(p.reason);
  const r = await deliverShare(p);
  await recordShareResult(shareId, r);
  return prisma.genieShare.findUniqueOrThrow({ where: { id: shareId } });
}

describe('which accounts send', () => {
  const own = { twilioAccountSid: 'AC' + 'a'.repeat(32), twilioAuthTokenEnc: 'x', twilioMessagingServiceSid: 'MG' + 'b'.repeat(32), emailProvider: 'resend', emailFromAddress: 'p@snap.test', resendApiKeyEnc: 'x' } as any;
  const genie = { product: 'genie' }, crm = { product: 'crm' };

  it('Genie-only accounts use BoothGen unless they set up their own; Genius accounts never use BoothGen', () => {
    expect(messagingRoutes(null, genie)).toEqual({ sms: 'boothgen', email: 'boothgen' });
    expect(messagingRoutes(own, genie)).toEqual({ sms: 'own', email: 'own' });
    expect(messagingRoutes({ ...own, smsSource: 'boothgen' }, genie)).toEqual({ sms: 'boothgen', email: 'own' });
    expect(messagingRoutes({ smsSource: 'own', emailSource: 'own' } as any, genie)).toEqual({ sms: null, email: null });
    expect(messagingRoutes(null, crm)).toEqual({ sms: null, email: null });
    expect(messagingRoutes({ smsSource: 'boothgen' } as any, crm)).toEqual({ sms: null, email: null });
    expect(messagingRoutes(own, crm)).toEqual({ sms: 'own', email: 'own' });
  });

  it('stays off until BoothGen\'s keys are set', () => {
    vi.unstubAllEnvs();
    for (const k of Object.keys(ENV)) vi.stubEnv(k, '');
    expect(messagingRoutes(null, genie)).toEqual({ sms: null, email: null });
  });

  it('turns texts and email on in the bundle for a Genie-only account with nothing set up', async () => {
    const { tenant, client } = await genieOnly();
    const event = await seedEvent(tenant.id, client.id);
    const b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && (b.bundle.sharing as any)).toMatchObject({ smsEnabled: true, emailEnabled: true });
  });
});

describe('sending through BoothGen', () => {
  it('texts from BoothGen\'s Twilio with its status callback, and records the provider', async () => {
    const { tenant, client } = await genieOnly();
    const { share } = await seedShare(tenant.id, client.id, 'sms');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: 'SM' + 'e'.repeat(32), status: 'queued' }), { status: 201 }));
    const saved = await send(share.id);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(`/Accounts/${ENV.BOOTHGEN_TWILIO_ACCOUNT_SID}/Messages.json`);
    const form = new URLSearchParams(init.body);
    expect(form.get('MessagingServiceSid')).toBe(ENV.BOOTHGEN_TWILIO_MESSAGING_SERVICE_SID);
    expect(form.get('StatusCallback')).toBe('https://boothgen.test/api/webhooks/twilio/genie/boothgen');
    expect(saved).toMatchObject({ status: 'sent', provider: 'boothgen' });
  });

  it('emails from BoothGen\'s domain under the business name, replying to the operator', async () => {
    const { tenant, client } = await genieOnly();
    await prisma.tenantBranding.create({ data: { tenantId: tenant.id, companyName: 'Nolasco Photo Booth', replyToEmail: 'hi@nolasco.test' } });
    const { share } = await seedShare(tenant.id, client.id, 'email');
    resendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null });
    const saved = await send(share.id);
    const [key, msg] = resendSend.mock.calls[0];
    expect(key).toBe('re_platform');
    expect(msg).toMatchObject({ from: 'Nolasco Photo Booth via BoothGen <photos@mail.boothgen.test>', reply_to: 'hi@nolasco.test', to: 'sam@example.com' });
    expect(saved).toMatchObject({ status: 'sent', provider: 'boothgen' });
  });

  it('stops at the safety limit of texts per event', async () => {
    const { tenant, client } = await genieOnly();
    const { share, event, session } = await seedShare(tenant.id, client.id, 'sms');
    await prisma.genieShare.createMany({
      data: Array.from({ length: BOOTHGEN_SMS_LIMIT_PER_EVENT }, () => ({
        tenantId: tenant.id, eventId: event.id, sessionId: session.id, clientId: randomUUID(), channel: 'sms', destination: '+14155550100',
        status: 'delivered', provider: 'boothgen', requestedAt: new Date(),
      })),
    });
    const saved = await send(share.id);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saved.status).toBe('failed');
    expect(saved.error).toContain('limit');
  });
});

describe('BoothGen delivery status', () => {
  const callback = (path: string, token: string, fields: Record<string, string>) => {
    const url = `https://boothgen.test/api/webhooks/twilio/genie/${path}`;
    return twilioWebhook(new NextRequest(url, {
      method: 'POST', body: new URLSearchParams(fields).toString(),
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSignature(token, url, fields) },
    }), { params: { tenantId: path } });
  };

  it('accepts BoothGen-signed callbacks for BoothGen texts only', async () => {
    const { tenant, client } = await genieOnly();
    const { share } = await seedShare(tenant.id, client.id, 'sms');
    const sid = 'SM' + 'f'.repeat(32);
    await prisma.genieShare.update({ where: { id: share.id }, data: { status: 'sent', provider: 'boothgen', providerMessageId: sid } });

    expect((await callback('boothgen', 'wrong-token', { MessageSid: sid, MessageStatus: 'delivered' })).status).toBe(403);
    expect((await callback('boothgen', ENV.BOOTHGEN_TWILIO_AUTH_TOKEN, { MessageSid: sid, MessageStatus: 'delivered' })).status).toBe(204);
    expect((await prisma.genieShare.findUniqueOrThrow({ where: { id: share.id } })).status).toBe('delivered');

    // An operator's own Twilio callback can't touch a BoothGen text
    const other = await seedTenant();
    const own = await seedShare(other.tenant.id, other.client.id, 'sms');
    const sid2 = 'SM' + '1'.repeat(32);
    await prisma.genieShare.update({ where: { id: own.share.id }, data: { status: 'sent', provider: 'boothgen', providerMessageId: sid2 } });
    await callback(other.tenant.id, 'tenant-auth-token', { MessageSid: sid2, MessageStatus: 'failed' });
    expect((await prisma.genieShare.findUniqueOrThrow({ where: { id: own.share.id } })).status).toBe('sent');
  });
});

describe('Genie → Sharing settings', () => {
  it('shows and saves the choice for Genie-only accounts, and refuses it for Genius accounts', async () => {
    await genieOnly();
    let d = await (await GET_SETTINGS()).json();
    expect(d).toMatchObject({ boothgen: { allowed: true, sms: true, email: true }, smsSource: null, routes: { sms: 'boothgen', email: 'boothgen' } });
    const put = (body: unknown) => PUT_SETTINGS(req('/x', { method: 'PUT', body }));
    d = await (await put({ smsSource: 'own' })).json();
    expect(d).toMatchObject({ smsSource: 'own', routes: { sms: null, email: 'boothgen' } });

    const { tenant } = await seedTenant();
    sessionTenantId = tenant.id; // a Genius account
    expect((await put({ smsSource: 'boothgen' })).status).toBe(403);
    expect((await (await GET_SETTINGS()).json()).boothgen.allowed).toBe(false);
  });
});
