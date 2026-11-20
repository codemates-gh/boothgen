import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

let session: Record<string, unknown> | null = null;
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => session) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  uploadToR2: vi.fn(async (key: string) => 'https://media.boothgen.test/' + key),
}));
const sent: { channel: string; to: string; body: string }[] = [];
vi.mock('@/lib/genie/messaging', async orig => ({
  ...(await orig<typeof import('@/lib/genie/messaging')>()),
  getMessaging: vi.fn(async () => ({ routes: { sms: 'boothgen', email: 'boothgen' } })),
  sendSms: vi.fn(async (_m: unknown, to: string, body: string) => { sent.push({ channel: 'sms', to, body }); return { ok: true }; }),
  sendEmail: vi.fn(async (_m: unknown, to: string, subject: string) => { sent.push({ channel: 'email', to, body: subject }); return { ok: true }; }),
}));

import { prisma } from '@/lib/prisma/client';
import { GET, POST } from '@/app/api/events/[id]/genie/test-share/route';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const ev = (id: string) => ({ params: Promise.resolve({ id }) });
const image = 'data:image/jpeg;base64,' + Buffer.from('fake jpeg').toString('base64');

beforeEach(async () => { await resetDb(); sent.length = 0; });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

async function setup() {
  const { tenant, client } = await seedTenant();
  await prisma.tenant.update({ where: { id: tenant.id }, data: { genieEnabled: true } });
  const user = await prisma.user.create({ data: { email: `tester-${crypto.randomUUID()}@example.com`, name: 'Tester' } });
  session = { tenantId: tenant.id, tenantRole: 'HOST_ADMIN', userId: user.id };
  const event = await seedEvent(tenant.id, client.id);
  await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { smsEnabled: true, emailEnabled: true } });
  return event;
}
const send = (id: string, body: Record<string, unknown>) => POST(req('/x', { body: { templateName: 'Template 1', image, ...body } }), ev(id));

describe('Test Templates', () => {
  it("texts and emails the event's message with the test picture, without touching the gallery, and counts toward the limits", async () => {
    const event = await setup();
    expect((await send(event.id, { channel: 'sms', destination: '(415) 555-0134' })).status).toBe(200);
    expect((await send(event.id, { channel: 'email', destination: 'me@example.com' })).status).toBe(200);
    expect(sent.map(s => [s.channel, s.to])).toEqual([['sms', '+14155550134'], ['email', 'me@example.com']]);
    expect(sent[0].body).toMatch(/^\[Test\] .*https:\/\/media\.boothgen\.test\/genie-tests\//);
    expect(sent[1].body).toMatch(/^\[Test\] /);
    expect(await prisma.genieSession.count()).toBe(0);
    expect(await prisma.galleryAsset.count()).toBe(0);
    expect(await (await GET(req('/x'), ev(event.id))).json()).toEqual({ limits: { sms: 10, email: 20 }, used: { sms: 1, email: 1 } });
  });

  it('stops at 10 test texts per event', async () => {
    const event = await setup();
    for (let i = 0; i < 10; i++) expect((await send(event.id, { channel: 'sms', destination: '4155550134' })).status).toBe(200);
    const r = await send(event.id, { channel: 'sms', destination: '4155550134' });
    expect(r.status).toBe(429);
    expect(sent).toHaveLength(10);
  });

  it('refuses a channel the event has turned off, a bad address and a Past event', async () => {
    const event = await setup();
    await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { smsEnabled: false } });
    expect((await send(event.id, { channel: 'sms', destination: '4155550134' })).status).toBe(422);
    expect((await send(event.id, { channel: 'email', destination: 'not-an-email' })).status).toBe(422);
    await prisma.event.update({ where: { id: event.id }, data: { eventDate: new Date('2026-01-10'), startTime: null, endTime: null } });
    expect((await send(event.id, { channel: 'email', destination: 'me@example.com' })).status).toBe(409);
    expect(sent).toHaveLength(0);
  });
});
