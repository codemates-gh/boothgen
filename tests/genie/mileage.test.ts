import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

let tenantId = '';
vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => ({ userId: 'u1', tenantId, tenantRole: 'HOST_ADMIN' })) }));
vi.mock('@/lib/auth/config', () => ({ authOptions: {} }));
vi.mock('@/lib/stripe', () => ({ stripe: { paymentIntents: { retrieve: vi.fn(async () => ({ application_fee_amount: 0 })) } } }));

import { prisma } from '@/lib/prisma/client';
import { parseIrsRatesPage, periodStart, rateOn, checkIrsRates, getIrsRates, BUILT_IN_RATES } from '@/lib/bookkeeping/mileageRates';
import { ensureMileage, mileageCalc } from '@/lib/bookkeeping/mileage';
import { syncLedger } from '@/lib/bookkeeping/sync';
import { PATCH as PATCH_TRIP } from '@/app/api/bookkeeping/mileage/[eventId]/route';
import { req, resetDb, seedEvent, seedTenant } from './helpers';

const IRS_HTML = readFileSync(join(__dirname, '../fixtures/irs-standard-mileage-rates.html'), 'utf8');
const p = (eventId: string) => ({ params: Promise.resolve({ eventId }) });

// Google Routes: distance by origin → destination
function routes(distances: Record<string, number>) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const meters = distances[body.origin.address + ' → ' + body.destination.address];
    return new Response(JSON.stringify(meters ? { routes: [{ distanceMeters: meters }] } : { routes: [] }), { status: 200 });
  }) as unknown as typeof fetch;
}

async function setup() {
  const { tenant, client } = await seedTenant({ pro: true });
  tenantId = tenant.id;
  await prisma.tenantBranding.upsert({ where: { tenantId }, update: { businessAddress: '1 Home St, Columbia, MD' }, create: { tenantId, businessAddress: '1 Home St, Columbia, MD' } });
  const event = await seedEvent(tenant.id, client.id, { settings: false, templates: 0 }); // BOOKED, 2026-12-12, "The Glasshouse"
  await prisma.event.update({ where: { id: event.id }, data: { venueAddress: '9 Venue Rd', venueCity: 'Baltimore', venueState: 'MD', venuePostalCode: '21201' } });
  return { tenant, client, event };
}

beforeEach(async () => { await resetDb(); await prisma.systemSetting.deleteMany({ where: { key: 'irs_mileage_rates' } }); process.env.GOOGLE_MAPS_API_KEY = 'test-key'; });
afterAll(async () => { await resetDb(); await prisma.$disconnect(); });

describe('IRS mileage rates', () => {
  it('reads the IRS table, including mid-year periods', () => {
    expect(periodStart('2026 (July 1 – Dec. 31)')).toBe('2026-07-01');
    expect(periodStart('2026 (Jan. 1 – June 30)')).toBe('2026-01-01');
    expect(periodStart('7/1/2022-12/31/2022')).toBe('2022-07-01');
    expect(periodStart('2025')).toBe('2025-01-01');
    const rates = parseIrsRatesPage(IRS_HTML);
    expect(rates).toEqual(expect.arrayContaining([
      { from: '2026-07-01', cents: 76, source: 'IR-2026-29' },
      { from: '2026-01-01', cents: 72.5, source: 'IR-2025-128' },
      { from: '2025-01-01', cents: 70, source: 'IR-2024-312' },
    ]));
  });

  it('uses the rate in effect on the date', () => {
    expect(rateOn(BUILT_IN_RATES, new Date('2025-06-01'))).toBe(70);
    expect(rateOn(BUILT_IN_RATES, new Date('2026-03-01'))).toBe(72.5);
    expect(rateOn(BUILT_IN_RATES, new Date('2026-12-12'))).toBe(76);
  });

  it('adds new periods found on the IRS page', async () => {
    const html = IRS_HTML.replace('<tbody>', '<tbody><tr><td>2027</td><td>79</td><td>14</td><td>20</td><td>IR-2026-200</td></tr>');
    const r = await checkIrsRates((async () => new Response(html)) as unknown as typeof fetch);
    expect(r.added).toEqual(expect.arrayContaining([{ from: '2027-01-01', cents: 79, source: 'IR-2026-200' }]));
    expect(rateOn(await getIrsRates(), new Date('2027-05-01'))).toBe(79);
    const again = await checkIrsRates((async () => new Response(html)) as unknown as typeof fetch);
    expect(again.added).toEqual([]);
    expect((await checkIrsRates((async () => new Response('<html>moved</html>')) as unknown as typeof fetch)).error).toBeTruthy();
  });
});

describe('Mileage log', () => {
  it('looks up home base → venue → home base and books it at the IRS rate, with the calculation shown', async () => {
    const { event } = await setup();
    const fetcher = routes({ '1 Home St, Columbia, MD → 9 Venue Rd, Baltimore, MD 21201': 24.3 * 1609.344 });
    await ensureMileage(tenantId, { fetcher });
    const m = await prisma.eventMileage.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(m).toMatchObject({ status: 'ok', oneWayMiles: 24.3, returnMiles: null });

    await syncLedger(tenantId);
    const line = await prisma.ledgerTransaction.findFirstOrThrow({ where: { tenantId, source: 'mileage' }, include: { category: true } });
    // 48.6 mi × 76¢ (event on 2026-12-12) = $36.94
    expect(line).toMatchObject({ type: 'EXPENSE', amountCents: 3694, eventId: event.id });
    expect(line.category?.name).toBe('Travel & Mileage');
    expect(line.description).toContain('home base → venue 24.3 mi + venue → home base 24.3 mi = 48.6 mi × 76¢/mi (IRS business rate from 2026-07-01)');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await ensureMileage(tenantId, { fetcher }); // cached: no new lookup
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses a different start and return, your own miles, and your own rate', async () => {
    const { event } = await setup();
    const fetcher = routes({
      '5 Other Gig Ave → 9 Venue Rd, Baltimore, MD 21201': 10 * 1609.344,
      '9 Venue Rd, Baltimore, MD 21201 → 7 Storage Ln': 15 * 1609.344,
    });
    await prisma.eventMileage.create({ data: { tenantId, eventId: event.id, startAddress: '5 Other Gig Ave', returnAddress: '7 Storage Ln' } });
    await ensureMileage(tenantId, { fetcher });
    const m = await prisma.eventMileage.findUniqueOrThrow({ where: { eventId: event.id } });
    expect(m).toMatchObject({ oneWayMiles: 10, returnMiles: 15 });
    expect(mileageCalc(m, new Date('2026-12-12'), null, BUILT_IN_RATES)).toMatchObject({ miles: 25, amountCents: 1900, text: expect.stringContaining('your start → venue 10 mi + venue → your return address 15 mi = 25 mi') });

    // Your own miles win; a custom rate replaces the IRS rate
    const res = await PATCH_TRIP(req('/x', { method: 'PATCH', body: { overrideMiles: 40 } }), p(event.id));
    expect((await res.json()).calc).toMatchObject({ miles: 40, source: 'override', amountCents: 3040 });
    await prisma.tenantBranding.update({ where: { tenantId }, data: { mileageRateCents: 65 } });
    await syncLedger(tenantId);
    const line = await prisma.ledgerTransaction.findFirstOrThrow({ where: { tenantId, source: 'mileage' } });
    expect(line.amountCents).toBe(2600);
    expect(line.description).toContain('40 mi (your own number) × 65¢/mi (your rate)');

    // Turning the log off removes the line
    await prisma.tenantBranding.update({ where: { tenantId }, data: { mileageEnabled: false } });
    await syncLedger(tenantId);
    expect(await prisma.ledgerTransaction.count({ where: { tenantId, source: 'mileage' } })).toBe(0);
  });

  it('waits for Google Maps to be set up, and explains a missing address', async () => {
    const { event } = await setup();
    delete process.env.GOOGLE_MAPS_API_KEY;
    await ensureMileage(tenantId);
    expect(await prisma.eventMileage.findUniqueOrThrow({ where: { eventId: event.id } })).toMatchObject({ status: 'pending' });
    await prisma.tenantBranding.update({ where: { tenantId }, data: { businessAddress: null } });
    await ensureMileage(tenantId);
    expect(await prisma.eventMileage.findUniqueOrThrow({ where: { eventId: event.id } })).toMatchObject({ status: 'no_address', error: expect.stringContaining('business address') });
  });
});
