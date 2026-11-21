import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'crypto';

// Genie P13: Geniefied (AI photo booth): event settings, bundle, render routes, allowance, add-on billing, late designs

let sessionTenantId = '';
let globalRole = 'USER';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN', globalRole })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
const sent: any[] = [];
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async (e: any) => { sent.push(e); return { ids: [] }; }) } }));
const created: any[] = [];
vi.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { create: vi.fn(async (args: any) => { created.push(args); return { id: 'cs_test_' + randomUUID(), url: 'https://checkout.stripe.test/pay' }; }) } } },
}));
const objects = new Map<string, number>();
const deleted: string[] = [];
vi.mock('@/lib/storage/r2', async orig => ({
  ...(await orig<typeof import('@/lib/storage/r2')>()),
  getPresignedUploadUrl: vi.fn(async (key: string) => 'https://r2.test/upload/' + key),
  getPresignedDownloadUrl: vi.fn(async (key: string) => 'https://r2.test/get/' + key),
  headR2Object: vi.fn(async (key: string) => (objects.has(key) ? { bytes: objects.get(key)! } : null)),
  getR2Object: vi.fn(async (key: string) => (objects.has(key) ? { body: Buffer.from('shot'), contentType: 'image/jpeg' } : null)),
  uploadToR2: vi.fn(async (key: string, body: Buffer) => { objects.set(key, body.length); return key; }),
  deleteFromR2: vi.fn(async (key: string) => { deleted.push(key); objects.delete(key); }),
  r2PublicUrl: (key: string) => 'https://media.boothgen.test/' + key,
}));
vi.mock('@/lib/genie/ai/image', () => ({ toJpeg: vi.fn(async (b: Buffer) => ({ body: b, width: 1024, height: 1536 })), placeholderJpeg: vi.fn(async (seed: string) => Buffer.from('placeholder:' + seed)) }));
let providerResult: any = { ok: true, image: Buffer.from('geniefied') };
const providerCalls: any[] = [];
vi.mock('@/lib/genie/ai/provider', () => ({ renderWithGoogle: vi.fn(async (_i: Buffer, prompt: string, model: string) => { providerCalls.push({ prompt, model }); return providerResult; }) }));

import { prisma } from '@/lib/prisma/client';
import { readySubjectFor, readyTextFor } from '@/lib/genie/ai/eventConfig';
import { buildEventBundle } from '@/lib/genie/bundle';
import { eventBilling, recordCheckout, PAYMENT_KIND } from '@/lib/genie/payments';
import { eventAllowance, sweepRenderInputs } from '@/lib/genie/ai/renders';
import { PROMPT_PREAMBLE } from '@/lib/genie/ai/settings';
import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { POST as PAY } from '@/app/api/genie-events/[id]/pay/route';
import { POST as RENDER } from '@/app/api/genie/events/[eventId]/ai-renders/route';
import { GET as RENDER_STATUS } from '@/app/api/genie/events/[eventId]/ai-renders/[renderId]/route';
import { POST as uploadUrl } from '@/app/api/genie/events/[eventId]/upload-url/route';
import { POST as registerAsset } from '@/app/api/genie/events/[eventId]/assets/route';
import { GET as sessionPage } from '@/app/api/g/[token]/s/[sessionToken]/route';
import { bundleValidator, guestSession, req, resetDb, seedDevice, seedEvent, seedTenant } from './helpers';

const ev = (id: string) => ({ params: Promise.resolve({ id }) });
const evId = (eventId: string) => ({ params: Promise.resolve({ eventId }) });
const SAMPLE = { url: 'https://media.boothgen.test/genie-ai-themes/standard/' + 'a'.repeat(64) + '.jpg', sha256: 'a'.repeat(64), contentType: 'image/jpeg', bytes: 120_000 };
const CONSENT = { acceptedAt: '2026-12-12T23:41:00Z', textSha256: createHash('sha256').update('ok').digest('hex') };

async function setup(opts: { ready?: boolean; product?: 'genie' | 'crm' } = {}) {
  const t = await seedTenant();
  await prisma.tenant.update({ where: { id: t.tenant.id }, data: { product: opts.product ?? 'genie' } });
  sessionTenantId = t.tenant.id;
  const event = await seedEvent(t.tenant.id, t.client.id);
  const { token } = await seedDevice(t.tenant.id);
  await prisma.systemSetting.upsert({ where: { key: 'geniefied_ready' }, create: { key: 'geniefied_ready', value: opts.ready === false ? 'off' : 'on' }, update: { value: opts.ready === false ? 'off' : 'on' } });
  const oil = await prisma.genieAiTheme.create({ data: { tenantId: null, name: 'Oil painting', prompt: 'Make it an oil painting.', sample: SAMPLE } });
  const mine = await prisma.genieAiTheme.create({ data: { tenantId: t.tenant.id, name: 'Our look', prompt: 'Our secret look.', sample: SAMPLE, fastModel: null } });
  const noSample = await prisma.genieAiTheme.create({ data: { tenantId: null, name: 'Draft', prompt: 'Not ready yet.' } });
  return { tenant: { ...t.tenant, product: opts.product ?? 'genie' }, event, token, oil, mine, noSample };
}
const AI = (themeIds: string[], over: Record<string, unknown> = {}) => ({ aiBooth: { enabled: true, mode: 'beforeStart', themeIds, fixedThemeId: null, consentText: null, waitSeconds: 45, readyText: null, ...over } });
async function shot(eventId: string, token: string) {
  const u = await uploadUrl(req('/x', { token, body: { clientId: randomUUID(), fileName: 'shot.jpg', contentType: 'image/jpeg', bytes: 900_000 } }), evId(eventId));
  const { storageKey } = await u.json();
  objects.set(storageKey, 900_000);
  return storageKey as string;
}
const renderBody = (key: string, themeId: string, session = randomUUID(), shotIndex = 0, faceCount = 1) =>
  ({ sessionId: session, shotIndex, shotStorageKey: key, themeId, faceCount, idempotencyKey: `${session}:${shotIndex}:${themeId}`, consent: CONSENT });
const post = (eventId: string, token: string, body: any) => RENDER(req('/x', { token, body }), evId(eventId));
async function waitDone(id: string) {
  for (let i = 0; i < 100; i++) {
    const r = await prisma.genieAiRender.findUnique({ where: { id } });
    if (r && r.status !== 'queued' && r.status !== 'rendering') return r;
    await new Promise(res => setTimeout(res, 20));
  }
  throw new Error('render never finished');
}
const checkout = (tenantId: string, eventId: string, meta: Record<string, string>, amount: number) => ({
  id: 'cs_test_' + randomUUID(), payment_status: 'paid', amount_total: amount, currency: 'usd', metadata: { kind: PAYMENT_KIND, tenantId, eventId, ...meta },
} as any);

beforeEach(async () => {
  await resetDb(); objects.clear(); deleted.length = 0; created.length = 0; sent.length = 0; providerCalls.length = 0; globalRole = 'USER';
  providerResult = { ok: true, image: Buffer.from('geniefied') };
  await prisma.genieAiTheme.deleteMany({});
  await prisma.systemSetting.deleteMany({ where: { key: { startsWith: 'ai_' } } });
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['geniefied_ready', 'addon_price_cents_geniefied', 'genie_event_price_cents'] } } });
});
afterAll(async () => { await prisma.genieAiTheme.deleteMany({}); await resetDb(); await prisma.$disconnect(); });

describe('event settings and bundle', () => {
  it('off by default; on sends aiBooth with themes that have a sample and no prompts, valid against the Genie schema', async () => {
    const { tenant, event, oil, mine, noSample } = await setup();
    let b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && 'aiBooth' in b.bundle).toBe(false);
    expect((await (await DASH(req('/x'), ev(event.id))).json()).settings.aiBooth).toMatchObject({ enabled: false, mode: 'beforeStart', themeIds: [] });

    expect((await PATCH(req('/x', { method: 'PATCH', body: AI([mine.id, oil.id, noSample.id], { waitSeconds: 60 }) }), ev(event.id))).status).toBe(200);
    b = await buildEventBundle(tenant.id, event.id);
    const ai = b.ok && (b.bundle.aiBooth as any);
    expect(ai).toMatchObject({ enabled: true, mode: 'beforeStart', waitSeconds: 60, consentText: expect.stringContaining('18 or older') });
    // A theme without a sample gets a placeholder card, so it's offered too
    expect(ai.themes.map((t: any) => [t.id, t.source])).toEqual([[mine.id, 'account'], [oil.id, 'standard'], [noSample.id, 'standard']]);
    expect(ai.themes[2].sample.url).toContain('/genie-ai-themes/standard/placeholders/');
    expect(JSON.stringify(ai)).not.toContain('secret');
    // Unpaid add-on: watermarked
    expect(b.ok && b.bundle.watermark).toBeTruthy();
    const validate = await bundleValidator();
    if (validate && b.ok) expect(validate(b.bundle)).toBeNull();

    await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id], { mode: 'fixedTheme', fixedThemeId: oil.id, consentText: 'Custom consent' }) }), ev(event.id));
    b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && b.bundle.aiBooth).toMatchObject({ mode: 'fixedTheme', fixedThemeId: oil.id, consentText: 'Custom consent' });
    if (validate && b.ok) expect(validate(b.bundle)).toBeNull();
  });

  it('the "Get Geniefied" title is shown unless turned off; off sends showTitle: false and default wording without the name', async () => {
    const { tenant, event, oil } = await setup();
    await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id]) }), ev(event.id));
    let b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && (b.bundle.aiBooth as any).showTitle).toBeUndefined();
    expect((await (await DASH(req('/x'), ev(event.id))).json()).settings.aiBooth.showTitle).toBe(true);

    await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id], { showTitle: false }) }), ev(event.id));
    b = await buildEventBundle(tenant.id, event.id);
    const ai = b.ok && (b.bundle.aiBooth as any);
    expect(ai.showTitle).toBe(false);
    expect(ai.consentText).not.toContain('Geniefied');
    const s = await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(readyTextFor(s)).toBe('Your AI photo from {{eventName}} is ready: {{link}}');
    expect(readySubjectFor(s)).toBe('Your AI photo is ready');
  });

  it('checks the themes and the fixed theme, and can be turned on only when Geniefied is available', async () => {
    const { event, oil } = await setup({ ready: false });
    expect((await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id]) }), ev(event.id))).status).toBe(400);
    await prisma.systemSetting.update({ where: { key: 'geniefied_ready' }, data: { value: 'on' } });
    const other = await prisma.genieAiTheme.create({ data: { tenantId: (await seedTenant()).tenant.id, name: 'Theirs', prompt: 'Not yours.', sample: SAMPLE } });
    expect((await PATCH(req('/x', { method: 'PATCH', body: AI([other.id]) }), ev(event.id))).status).toBe(400);
    expect((await PATCH(req('/x', { method: 'PATCH', body: AI([]) }), ev(event.id))).status).toBe(400);
    expect((await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id], { mode: 'fixedTheme' }) }), ev(event.id))).status).toBe(400);
    expect((await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id]) }), ev(event.id))).status).toBe(200);
  });
});

describe('render routes', () => {
  it('renders a shot once per idempotency key, stores the result, deletes the input and reports it', async () => {
    const { event, token, oil } = await setup();
    await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id]) }), ev(event.id));
    const key = await shot(event.id, token);
    const body = renderBody(key, oil.id, randomUUID(), 0, 4);
    const r = await post(event.id, token, body);
    expect(r.status).toBe(202);
    const first = await r.json();
    expect(first).toMatchObject({ status: 'queued', renderId: expect.any(String), rendersLeft: 19 });

    await waitDone(first.renderId);
    expect(providerCalls).toEqual([{ prompt: PROMPT_PREAMBLE + '\n\nStyle: Make it an oil painting.', model: 'gemini-3-pro-image-preview' }]);
    // The shot is kept: the iPad may register this same upload as the session's shot
    expect(deleted).not.toContain(key);
    const status = await (await RENDER_STATUS(req('/x', { token }), { params: Promise.resolve({ eventId: event.id, renderId: first.renderId }) })).json();
    expect(status).toMatchObject({ status: 'done', width: 1024, height: 1536, resultUrl: expect.stringContaining('/ai-' + first.renderId + '.jpg'), rendersLeft: 19 });
    const row = await prisma.genieAiRender.findUniqueOrThrow({ where: { id: first.renderId } });
    expect(row).toMatchObject({ consentTextSha256: CONSENT.textSha256, trial: true, estimatedCostCents: 13 });

    // The same request again (input gone): the same render, 200, nothing charged twice
    const again = await RENDER(req('/x', { token, body, headers: { 'Idempotency-Key': body.idempotencyKey } } as any), evId(event.id));
    expect(again.status).toBe(200);
    expect((await again.json()).renderId).toBe(first.renderId);
    expect(await prisma.genieAiRender.count()).toBe(1);
    // 1–2 faces: the fast model
    const r2 = await (await post(event.id, token, renderBody(await shot(event.id, token), oil.id, randomUUID(), 0, 2))).json();
    await waitDone(r2.renderId);
    expect(providerCalls[1].model).toBe('gemini-3.1-flash-image');
  });

  it('refuses when off, unknown themes, keys from elsewhere and missing objects', async () => {
    const { event, token, oil } = await setup();
    const key = await shot(event.id, token);
    expect((await (await post(event.id, token, renderBody(key, oil.id))).json()).code).toBe('ai_booth_off');
    await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id]) }), ev(event.id));
    const bad = async (body: any) => { const r = await post(event.id, token, body); return [r.status, (await r.json()).code]; };
    expect(await bad(renderBody(key, 'nope'))).toEqual([422, 'unknown_theme']);
    expect(await bad(renderBody('galleries/other/x/genie-1-shot.jpg', oil.id))).toEqual([422, 'invalid_storage_key']);
    expect(await bad(renderBody(key.replace('shot', 'gone'), oil.id))).toEqual([422, 'object_missing']);
    const mismatch = await RENDER(req('/x', { token, body: renderBody(key, oil.id), headers: { 'Idempotency-Key': 'other' } } as any), evId(event.id));
    expect(mismatch.status).toBe(400);
  });

  it('trial allowance runs out (allowanceExhausted, no render); blocked and failed renders give it back', async () => {
    const { event, token, oil } = await setup();
    await prisma.systemSetting.create({ data: { key: 'ai_trial_renders', value: '2' } });
    await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id]) }), ev(event.id));
    providerResult = { ok: false, blocked: true, message: 'Refused' };
    const a = await (await post(event.id, token, renderBody(await shot(event.id, token), oil.id))).json();
    await waitDone(a.renderId);
    expect(await prisma.genieAiRender.findUniqueOrThrow({ where: { id: a.renderId } })).toMatchObject({ status: 'blocked', counted: false });
    providerResult = { ok: true, image: Buffer.from('x') };
    expect((await post(event.id, token, renderBody(await shot(event.id, token), oil.id))).status).toBe(202);
    expect((await post(event.id, token, renderBody(await shot(event.id, token), oil.id))).status).toBe(202);
    const none = await post(event.id, token, renderBody(await shot(event.id, token), oil.id));
    expect([none.status, await none.json()]).toEqual([200, { status: 'allowanceExhausted', rendersLeft: 0 }]);
  });
});

describe('render inputs', () => {
  it('kept when registered as the session shot; deleted two days later when never registered', async () => {
    const { event, token, oil } = await setup();
    await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id]) }), ev(event.id));
    const session = guestSession();
    const kept = await shot(event.id, token), unused = await shot(event.id, token);
    for (const [k, i] of [[kept, 0], [unused, 1]] as const) await waitDone((await (await post(event.id, token, renderBody(k, oil.id, session.id, i))).json()).renderId);
    // The iPad registers the first upload as the session's shot (same object, no copy)
    const reg = await registerAsset(req('/x', { token, body: { clientId: randomUUID(), session, kind: 'shot', shotIndex: 0, fileName: 'shot.jpg', contentType: 'image/jpeg', bytes: 900_000,
      width: 1200, height: 1800, sha256: 'a'.repeat(64), capturedAt: '2026-12-12T23:41:10Z', storageKey: kept } }), evId(event.id));
    expect(reg.status).toBe(201);
    expect(await sweepRenderInputs()).toEqual({ deleted: 0 });
    expect(await sweepRenderInputs(new Date(Date.now() + 49 * 3600_000))).toEqual({ deleted: 1 });
    expect(deleted).toEqual([unused]);
    expect(objects.has(kept)).toBe(true);
  });
});

describe('add-on billing and allowance', () => {
  it('Geniefied is charged with the event ($29, 100 renders); top-ups add 100 for $19; a waiver gives the included renders', async () => {
    const { tenant, event, oil } = await setup();
    await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id]) }), ev(event.id));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ addOnsDue: [{ id: 'geniefied', cents: 2900 }], amountDueCents: 1500 + 2900 });
    expect((await PAY(req('/x', { body: { aiTopUp: true } }), ev(event.id))).status).toBe(409);
    await PAY(req('/x', { body: {} }), ev(event.id));
    expect(created[0].metadata).toMatchObject({ addOns: 'geniefied', aiRenders: '100' });
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '2', addOns: 'geniefied', aiRenders: '100' }, 4400));
    expect(await eventAllowance(event.id, tenant.id)).toMatchObject({ covered: true, total: 100, left: 100 });
    expect((await eventBilling(tenant, event.id)).watermark).toBe(false);

    created.length = 0;
    expect((await PAY(req('/x', { body: { aiTopUp: true } }), ev(event.id))).status).toBe(200);
    expect(created[0].line_items.map((l: any) => l.price_data.unit_amount)).toEqual([1900]);
    expect(created[0].metadata).toMatchObject({ ipads: '0', aiRenders: '100' });
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '0', addOns: '', aiRenders: '100' }, 1900));
    expect(await eventAllowance(event.id, tenant.id)).toMatchObject({ total: 200 });
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).maxDevices).toBe(2);

    const w = await setup();
    await prisma.tenant.update({ where: { id: w.tenant.id }, data: { addOnWaivers: { geniefied: new Date().toISOString() } } });
    expect(await eventAllowance(w.event.id, w.tenant.id)).toMatchObject({ covered: true, total: 100 });
  });
});

describe('late Geniefied designs', () => {
  it('a second gallery replaces the first, the page shows a Geniefied before/after, and guests already sent get the ready message', async () => {
    const { event, token, oil } = await setup();
    await PATCH(req('/x', { method: 'PATCH', body: AI([oil.id]) }), ev(event.id));
    const session = guestSession();
    async function upload(kind: string) {
      const clientId = randomUUID();
      const u = await uploadUrl(req('/x', { token, body: { clientId, fileName: kind + '.jpg', contentType: 'image/jpeg', bytes: 800_000 } }), evId(event.id));
      const { storageKey } = await u.json();
      objects.set(storageKey, 800_000);
      return registerAsset(req('/x', { token, body: { clientId, session, kind, fileName: kind + '.jpg', contentType: 'image/jpeg', bytes: 800_000, width: 1200, height: 1800,
        sha256: 'a'.repeat(64), capturedAt: '2026-12-12T23:41:10Z', storageKey } }), evId(event.id));
    }
    const first = await (await upload('gallery')).json();
    const s = await prisma.genieSession.findUniqueOrThrow({ where: { clientId: session.id } });
    await prisma.genieShare.create({ data: { tenantId: s.tenantId, eventId: event.id, sessionId: s.id, clientId: randomUUID(), channel: 'email', destination: 'guest@example.com', status: 'sent', requestedAt: new Date() } });
    // A render for this session finished (the late design)
    await prisma.genieAiRender.create({ data: { tenantId: s.tenantId, eventId: event.id, sessionClientId: session.id, shotIndex: 0, themeId: oil.id, idempotencyKey: 'k', status: 'done', inputKey: 'x', consentAcceptedAt: new Date(), consentTextSha256: CONSENT.textSha256 } });
    sent.length = 0;
    await upload('gallery');

    const kinds = (await prisma.galleryAsset.findMany({ where: { genieSessionId: s.id }, orderBy: { createdAt: 'asc' } })).map(a => a.genieKind);
    expect(kinds).toEqual(['gallerySuperseded', 'gallery']);
    const ready = await prisma.genieShare.findFirstOrThrow({ where: { kind: 'aiReady' } });
    expect(ready).toMatchObject({ destination: 'guest@example.com', status: 'queued' });
    expect(JSON.stringify(sent)).toContain(ready.id);

    const gallery = await prisma.gallery.findUniqueOrThrow({ where: { eventId: event.id } });
    const page = await (await sessionPage(req('/x'), { params: Promise.resolve({ token: gallery.clientToken, sessionToken: first.sessionUrl.split('/s/')[1] }) })).json();
    expect(page.assets.filter((a: any) => a.isGallery)).toHaveLength(1);
    expect(page.assets[0]).toMatchObject({ afterLabel: 'Geniefied', originalUrl: expect.stringContaining('gallery.jpg') });
  });
});
