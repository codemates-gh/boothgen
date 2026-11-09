import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';

const resendSend = vi.fn();
vi.mock('resend', () => ({ Resend: vi.fn().mockImplementation((key: string) => ({ emails: { send: (msg: unknown) => resendSend(key, msg) } })) }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));
vi.mock('@/lib/storage/r2', () => ({ headR2Object: vi.fn(), getPresignedUploadUrl: vi.fn(), r2PublicUrl: (k: string) => 'https://media.boothgen.test/' + k }));

import { prisma } from '@/lib/prisma/client';
import { decryptSecret, encryptSecret } from '@/lib/crypto/secrets';
import { twilioSignature } from '@/lib/sms/twilio';
import { deliverShare, prepareShare, recordShareResult, renderMergeFields } from '@/lib/genie/shares';
import { buildEventBundle } from '@/lib/genie/bundle';
import { POST as twilioWebhook } from '@/app/api/webhooks/twilio/genie/[tenantId]/route';
import { POST as createShare } from '@/app/api/genie/events/[eventId]/shares/route';
import { TWILIO_SID, TWILIO_TOKEN, guestSession, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const fetchMock = vi.fn();
beforeEach(async () => {
  await resetDb();
  resendSend.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  await resetDb();
  await prisma.$disconnect();
});

// A share whose session already has one registered photo
async function seedShare(opts: { channel?: 'sms' | 'email'; scope?: 'own' | 'all'; messaging?: boolean; consent?: boolean } = {}) {
  const { tenant, client } = await seedTenant({ messaging: opts.messaging });
  const event = await seedEvent(tenant.id, client.id);
  await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { guestLinkScope: opts.scope ?? 'own' } });
  const gallery = await prisma.gallery.create({ data: { tenantId: tenant.id, eventId: event.id, title: 'G' } });
  const s = guestSession();
  const session = await prisma.genieSession.create({ data: { tenantId: tenant.id, eventId: event.id, galleryId: gallery.id, clientId: s.id, publicToken: s.publicToken, startedAt: new Date() } });
  await prisma.galleryAsset.create({ data: { galleryId: gallery.id, genieSessionId: session.id, clientId: randomUUID(), assetType: 'PHOTO', url: 'https://media.boothgen.test/x.jpg', filename: 'x.jpg', fileSizeBytes: 1, mimeType: 'image/jpeg', approvalStatus: 'APPROVED' } });
  const channel = opts.channel ?? 'sms';
  const share = await prisma.genieShare.create({
    data: {
      tenantId: tenant.id, eventId: event.id, sessionId: session.id, clientId: randomUUID(), channel,
      destination: channel === 'sms' ? '+14155550123' : 'sam@example.com', firstName: 'Sam',
      smsConsentAt: channel === 'sms' && opts.consent !== false ? new Date() : null, requestedAt: new Date(),
    },
  });
  return { tenant, event, gallery, session, share };
}

describe('secrets', () => {
  it('round-trips and never stores plaintext', () => {
    const enc = encryptSecret('super-secret');
    expect(enc).not.toContain('super-secret');
    expect(decryptSecret(enc)).toBe('super-secret');
    const [v, iv, tag, data] = enc.split(':');
    const tampered = [v, iv, tag, Buffer.from('x' + Buffer.from(data, 'base64').toString()).toString('base64')].join(':');
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

describe('merge fields', () => {
  it('renders firstName, eventName and link', () => {
    expect(renderMergeFields('Hi {{firstName}}! {{eventName}}: {{ link }}', { firstName: 'Sam', eventName: 'Rivera Wedding', link: 'https://x/s/1' }))
      .toBe('Hi Sam! Rivera Wedding: https://x/s/1');
    expect(renderMergeFields('Hi {{firstName}},', { firstName: '', eventName: 'E', link: 'l' })).toBe('Hi there,');
  });
});

describe('sending', () => {
  it('texts through the tenant’s own Twilio account with the session link', async () => {
    const { tenant, gallery, session, share } = await seedShare();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ sid: 'SM123', status: 'accepted' }), { status: 201 }));
    const prepared = await prepareShare(share.id);
    expect(prepared.ready).toBe(true);
    if (!prepared.ready) return;
    const result = await deliverShare(prepared);
    await recordShareResult(share.id, result);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`);
    expect(init.headers.Authorization).toBe('Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64'));
    const form = new URLSearchParams(init.body);
    expect(form.get('MessagingServiceSid')).toBe('MG' + 'b'.repeat(32));
    expect(form.get('Body')).toBe(`Hi Sam! Here are your photos from Rivera Wedding: https://boothgen.test/g/${gallery.clientToken}/s/${session.publicToken}`);
    expect(form.get('StatusCallback')).toBe(`https://boothgen.test/api/webhooks/twilio/genie/${tenant.id}`);
    expect(await prisma.genieShare.findUniqueOrThrow({ where: { id: share.id } })).toMatchObject({ status: 'sent', providerMessageId: 'SM123' });
  });

  it('emails through the tenant’s Resend key with the gallery link for scope "all"', async () => {
    const { gallery, share } = await seedShare({ channel: 'email', scope: 'all' });
    resendSend.mockResolvedValue({ data: { id: 'em_1' }, error: null });
    const prepared = await prepareShare(share.id);
    if (!prepared.ready) throw new Error('not ready');
    await recordShareResult(share.id, await deliverShare(prepared));
    const [key, msg] = resendSend.mock.calls[0];
    expect(key).toBe('re_tenant_key');
    expect(msg).toMatchObject({ from: 'Snap Co <photos@snap.test>', to: 'sam@example.com', subject: 'Your photos from Rivera Wedding' });
    expect(msg.text).toContain(`https://boothgen.test/g/${gallery.clientToken}`);
    expect(msg.text).not.toContain('/s/');
    expect(await prisma.genieShare.findUniqueOrThrow({ where: { id: share.id } })).toMatchObject({ status: 'sent', providerMessageId: 'em_1' });
  });

  it('does not send before the session has a photo', async () => {
    const { share, session } = await seedShare();
    await prisma.galleryAsset.deleteMany({ where: { genieSessionId: session.id } });
    expect(await prepareShare(share.id)).toEqual({ ready: false, reason: 'no_photos_yet' });
  });

  it('never falls back to a platform account when the tenant has no provider', async () => {
    const { share } = await seedShare({ messaging: false });
    const prepared = await prepareShare(share.id);
    if (!prepared.ready) throw new Error('not ready');
    const result = await deliverShare(prepared);
    expect(result).toEqual({ ok: false, error: 'SMS is not set up', retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
    await recordShareResult(share.id, result);
    expect((await prisma.genieShare.findUniqueOrThrow({ where: { id: share.id } })).status).toBe('failed');
  });

  it('refuses to text a share row without consent', async () => {
    const { share } = await seedShare({ consent: false });
    const prepared = await prepareShare(share.id);
    if (!prepared.ready) throw new Error('not ready');
    expect(await deliverShare(prepared)).toMatchObject({ ok: false, retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('marks Twilio 5xx as retryable and 4xx as permanent', async () => {
    const { share } = await seedShare();
    const prepared = await prepareShare(share.id);
    if (!prepared.ready) throw new Error('not ready');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Service unavailable' }), { status: 503 }));
    expect(await deliverShare(prepared)).toMatchObject({ ok: false, retryable: true });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Authenticate', code: 20003 }), { status: 401 }));
    expect(await deliverShare(prepared)).toMatchObject({ ok: false, error: 'Authenticate', retryable: false });
  });
});

describe('provider status gates the bundle and share intake', () => {
  it('reports channels without a provider as disabled', async () => {
    const { tenant, client } = await seedTenant({ messaging: false });
    const event = await seedEvent(tenant.id, client.id);
    const result = await buildEventBundle(tenant.id, event.id);
    if (!result.ok) throw new Error(result.error);
    expect(result.bundle.sharing).toMatchObject({ smsEnabled: false, emailEnabled: false });

    const { token } = await seedDevice(tenant.id);
    const body = { id: randomUUID(), session: guestSession(), channel: 'email', destination: 'a@b.co', createdAt: '2026-12-12T23:42:10Z' };
    const res = await createShare(req(`/api/genie/events/${event.id}/shares`, { token, body }), { params: { eventId: event.id } });
    expect(await res.json()).toMatchObject({ code: 'channel_disabled' });
  });
});

describe('Twilio status webhook', () => {
  function webhook(tenantId: string, fields: Record<string, string>, token = TWILIO_TOKEN) {
    const url = `https://boothgen.test/api/webhooks/twilio/genie/${tenantId}`;
    return new NextRequest(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': twilioSignature(token, url, fields) },
      body: new URLSearchParams(fields).toString(),
    });
  }

  it('updates delivery status when signed with the tenant’s token', async () => {
    const { tenant, share } = await seedShare();
    await prisma.genieShare.update({ where: { id: share.id }, data: { status: 'sent', providerMessageId: 'SM777' } });
    const res = await twilioWebhook(webhook(tenant.id, { MessageSid: 'SM777', MessageStatus: 'delivered', AccountSid: TWILIO_SID }), { params: { tenantId: tenant.id } });
    expect(res.status).toBe(204);
    expect((await prisma.genieShare.findUniqueOrThrow({ where: { id: share.id } })).status).toBe('delivered');
  });

  it('rejects a bad signature and ignores another tenant’s message', async () => {
    const a = await seedShare();
    const b = await seedShare();
    await prisma.genieShare.update({ where: { id: b.share.id }, data: { status: 'sent', providerMessageId: 'SM888' } });
    const bad = await twilioWebhook(webhook(a.tenant.id, { MessageSid: 'SM888', MessageStatus: 'failed' }, 'wrong-token'), { params: { tenantId: a.tenant.id } });
    expect(bad.status).toBe(403);
    // Correctly signed for tenant A but the message belongs to tenant B
    await twilioWebhook(webhook(a.tenant.id, { MessageSid: 'SM888', MessageStatus: 'failed' }), { params: { tenantId: a.tenant.id } });
    expect((await prisma.genieShare.findUniqueOrThrow({ where: { id: b.share.id } })).status).toBe('sent');
  });
});
