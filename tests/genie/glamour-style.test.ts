import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

// Genie add-ons (2.114.0): Glamour Style, $15 per event (Super Admin can change it), charged with the event

let sessionTenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId: sessionTenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: vi.fn(async () => ({ ids: [] })) } }));
const created: any[] = [];
vi.mock('@/lib/stripe', () => ({
  stripe: { checkout: { sessions: { create: vi.fn(async (args: any) => { created.push(args); return { id: 'cs_test_' + randomUUID(), url: 'https://checkout.stripe.test/pay' }; }) } } },
}));

import { prisma } from '@/lib/prisma/client';
import { buildEventBundle } from '@/lib/genie/bundle';
import { compEvent, eventBilling, recordCheckout, PAYMENT_KIND } from '@/lib/genie/payments';
import { boothEventsClient } from '@/lib/genie/boothEvents';
import { copyGenieSetup } from '@/lib/genie/duplicate';
import { POST as PAY } from '@/app/api/genie-events/[id]/pay/route';
import { GET as DASH, PATCH } from '@/app/api/events/[id]/genie/route';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const ev = (id: string) => ({ params: Promise.resolve({ id }) });
const GLAMOUR = { filters: { guestFiltersEnabled: true, defaultFilterId: 'original', filterIds: ['original', 'glamour'] } };

async function setup(product: 'genie' | 'crm' = 'genie') {
  const t = await seedTenant({ pro: product === 'crm' });
  await prisma.tenant.update({ where: { id: t.tenant.id }, data: { product } });
  sessionTenantId = t.tenant.id;
  const client = product === 'genie' ? await boothEventsClient(t.tenant.id) : t.client;
  const event = await seedEvent(t.tenant.id, client.id);
  return { tenant: { ...t.tenant, product }, event };
}
const checkout = (tenantId: string, eventId: string, meta: Record<string, string>, amount: number) => ({
  id: 'cs_test_' + randomUUID(), payment_status: 'paid', amount_total: amount, currency: 'usd', metadata: { kind: PAYMENT_KIND, tenantId, eventId, ...meta },
} as any);

beforeEach(async () => {
  await resetDb(); created.length = 0;
  await prisma.systemSetting.deleteMany({ where: { key: { in: ['genie_event_price_cents', 'genius_pays_per_event', 'addon_price_cents_glamour_style'] } } });
});
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('Glamour Style add-on', () => {
  it('no charge until it’s offered; offering it adds $15 to the event checkout, watermarked until paid', async () => {
    const { tenant, event } = await setup('genie');
    expect(await eventBilling(tenant, event.id)).toMatchObject({ addOns: [], addOnsDue: [], amountDueCents: 1500 });
    expect((await PATCH(req('/x', { method: 'PATCH', body: GLAMOUR }), ev(event.id))).status).toBe(200);
    expect(await eventBilling(tenant, event.id)).toMatchObject({ addOns: ['glamourStyle'], addOnsDue: [{ id: 'glamourStyle', name: 'Glamour Style', cents: 1500 }], amountDueCents: 3000 });
    let b = await buildEventBundle(tenant.id, event.id);
    // Sent before paying (try it), with the watermark; under its new name
    expect(b.ok && b.bundle.watermark).toBeTruthy();
    expect(b.ok && (b.bundle.filters as any).filters.find((f: any) => f.id === 'glamour')).toEqual({ id: 'glamour', name: 'Glamour Style', steps: [{ type: 'beautify', intensity: 0.7 }] });

    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(200);
    expect(created[0].line_items.map((l: any) => [l.price_data.product_data.name.split(':')[0], l.price_data.unit_amount])).toEqual([['Genie event', 1500], ['Glamour Style', 1500]]);
    expect(created[0].metadata).toMatchObject({ ipads: '2', addOns: 'glamourStyle' });
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '2', addOns: 'glamourStyle' }, 3000));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ watermark: false, addOnsDue: [], amountDueCents: 0 });
    b = await buildEventBundle(tenant.id, event.id);
    expect(b.ok && 'watermark' in b.bundle).toBe(false);
    const dash = await (await DASH(req('/x'), ev(event.id))).json();
    expect(dash.billing.history[0]).toMatchObject({ amountCents: 3000, addOns: ['Glamour Style'] });
  });

  it('added after the event is paid: its own checkout, no iPads, watermark until paid', async () => {
    const { tenant, event } = await setup('genie');
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '2' }, 1500));
    await PATCH(req('/x', { method: 'PATCH', body: GLAMOUR }), ev(event.id));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paid: true, watermark: true, amountDueCents: 1500 });
    await PAY(req('/x', { body: {} }), ev(event.id));
    expect(created[0].line_items.map((l: any) => l.price_data.unit_amount)).toEqual([1500]);
    expect(created[0].metadata).toMatchObject({ ipads: '0', addOns: 'glamourStyle' });
    await recordCheckout(checkout(tenant.id, event.id, { ipads: '0', addOns: 'glamourStyle' }, 1500));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ watermark: false, payments: 1, ipadsCovered: 2 });
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: event.id } })).maxDevices).toBe(2);
  });

  it('Genius accounts that don’t pay per event still pay for it; Super Admin sets the price', async () => {
    await prisma.systemSetting.create({ data: { key: 'addon_price_cents_glamour_style', value: '900' } });
    const { tenant, event } = await setup('crm');
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paysPerEvent: false, watermark: false });
    await PATCH(req('/x', { method: 'PATCH', body: GLAMOUR }), ev(event.id));
    expect(await eventBilling(tenant, event.id)).toMatchObject({ paysPerEvent: false, watermark: true, amountDueCents: 900 });
    expect((await PAY(req('/x', { body: {} }), ev(event.id))).status).toBe(200);
    expect(created[0].line_items.map((l: any) => l.price_data.unit_amount)).toEqual([900]);
  });

  it('events that used the free filter before keep it free; Duplicate doesn’t copy that; comps cover it', async () => {
    const { tenant, event } = await setup('genie');
    await PATCH(req('/x', { method: 'PATCH', body: GLAMOUR }), ev(event.id));
    await prisma.eventGenieSettings.update({ where: { eventId: event.id }, data: { addOnsIncluded: ['glamourStyle'] } });
    expect(await eventBilling(tenant, event.id)).toMatchObject({ addOnsDue: [], amountDueCents: 1500 });

    const copy = await seedEvent(tenant.id, (await boothEventsClient(tenant.id)).id);
    await prisma.eventGenieSettings.deleteMany({ where: { eventId: copy.id } });
    await prisma.$transaction(tx => copyGenieSetup(tx, event.id, copy.id, tenant.id));
    expect((await prisma.eventGenieSettings.findUniqueOrThrow({ where: { eventId: copy.id } })).addOnsIncluded).toEqual([]);
    expect(await eventBilling(tenant, copy.id)).toMatchObject({ addOnsDue: [{ id: 'glamourStyle' }] });

    await compEvent(copy.id);
    expect(await eventBilling(tenant, copy.id)).toMatchObject({ watermark: false, addOnsDue: [] });
  });
});
