// Mileage log: each booked event's trip start → venue → return, with both ends defaulting to the business address
// (home base, Settings → Branding) and changeable per event. Distances come from Google's Routes API
// (GOOGLE_MAPS_API_KEY), cached per event and looked up again only if an address changes. The operator can also type
// their own miles per event, set their own rate per mile, or turn the log off.
//
// Each event becomes a "Travel & Mileage" expense: miles × rate, where
//   miles = the operator's own miles, or start → venue plus (round trip) venue → return
//   rate  = the operator's own rate, or the IRS standard business rate in effect on the event date (mileageRates.ts)
import { prisma } from '@/lib/prisma/client';
import { getIrsRates, rateOn, type RatePeriod } from './mileageRates';

const MILE_METERS = 1609.344;
const ELIGIBLE = ['BOOKED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED'] as const;

export function venueAddress(e: { venueName?: string | null; venueAddress?: string | null; venueCity?: string | null; venueState?: string | null; venuePostalCode?: string | null }): string | null {
  const parts = [e.venueAddress, e.venueCity, [e.venueState, e.venuePostalCode].filter(Boolean).join(' ')].map(p => p?.trim()).filter(Boolean);
  if (parts.length === 0) return e.venueName?.trim() || null;
  return parts.join(', ');
}

// One-way driving distance in miles (1 decimal), or throws with a short reason
export async function drivingMiles(origin: string, destination: string, fetcher: typeof fetch = fetch): Promise<number> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('Google Maps is not set up');
  const res = await fetcher('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters' },
    body: JSON.stringify({ origin: { address: origin }, destination: { address: destination }, travelMode: 'DRIVE' }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? 'Google returned ' + res.status);
  const meters = body?.routes?.[0]?.distanceMeters;
  if (!Number.isFinite(meters)) throw new Error('No driving route found between these addresses');
  return Math.round((meters / MILE_METERS) * 10) / 10;
}

// Look up distances for events that don't have them yet (or whose addresses changed). At most `limit` events per run.
export async function ensureMileage(tenantId: string, opts: { limit?: number; eventId?: string; force?: boolean; fetcher?: typeof fetch } = {}) {
  const branding = await prisma.tenantBranding.findUnique({ where: { tenantId }, select: { businessAddress: true, mileageEnabled: true } });
  if (branding && branding.mileageEnabled === false) return { looked: 0 };
  const home = branding?.businessAddress?.trim() || null;
  const events = await prisma.event.findMany({
    where: { tenantId, status: { in: [...ELIGIBLE] }, ...(opts.eventId ? { id: opts.eventId } : {}) },
    select: { id: true, venueName: true, venueAddress: true, venueCity: true, venueState: true, venuePostalCode: true, mileage: true },
  });
  let looked = 0;
  for (const ev of events) {
    const m = ev.mileage;
    const destination = venueAddress(ev);
    const origin = m?.startAddress?.trim() || home;
    const returnTo = m?.returnAddress?.trim() || origin;
    const addr = { origin, destination, returnTo };
    if (!origin || !destination) {
      const error = !origin ? 'Add your business address (home base) in Settings → Branding' : 'This event has no venue address';
      if (!m || m.status !== 'no_address' || m.origin !== origin || m.destination !== destination || m.returnTo !== returnTo) {
        await prisma.eventMileage.upsert({ where: { eventId: ev.id }, update: { ...addr, status: 'no_address', oneWayMiles: null, returnMiles: null, error }, create: { tenantId, eventId: ev.id, ...addr, status: 'no_address', error } });
      }
      continue;
    }
    const same = m && m.origin === origin && m.destination === destination && m.returnTo === returnTo;
    if (same && !opts.force && (m.status === 'ok' || m.status === 'failed')) continue; // nothing new to look up
    if (looked >= (opts.limit ?? 20)) break;
    looked++;
    try {
      const oneWayMiles = await drivingMiles(origin, destination, opts.fetcher);
      const returnMiles = returnTo && returnTo !== origin ? await drivingMiles(destination, returnTo, opts.fetcher) : null;
      await prisma.eventMileage.upsert({ where: { eventId: ev.id }, update: { ...addr, oneWayMiles, returnMiles, status: 'ok', error: null, computedAt: new Date() }, create: { tenantId, eventId: ev.id, ...addr, oneWayMiles, returnMiles, status: 'ok', computedAt: new Date() } });
    } catch (e) {
      const msg = (e as Error).message;
      // No key yet: stay pending so it's looked up once Google Maps is set up
      const status = msg === 'Google Maps is not set up' ? 'pending' : 'failed';
      await prisma.eventMileage.upsert({ where: { eventId: ev.id }, update: { ...addr, status, error: msg }, create: { tenantId, eventId: ev.id, ...addr, status, error: msg } });
      if (status === 'pending') break; // no point trying the others
    }
  }
  return { looked };
}

export type MileageCalc = {
  miles: number; source: 'override' | 'google'; toVenue: number | null; fromVenue: number | null; roundTrip: boolean;
  rateCents: number; rateSource: 'custom' | 'irs'; ratePeriodFrom: string | null; amountCents: number; text: string;
};

const fmtRate = (c: number) => (Number.isInteger(c) ? c : c.toFixed(1)) + '¢';
const r1 = (n: number) => Math.round(n * 10) / 10;

// How one event's mileage is worked out (shown on the Bookkeeping line and in its edit window)
export function mileageCalc(
  m: { oneWayMiles: number | null; returnMiles: number | null; overrideMiles: number | null; roundTrip: boolean; startAddress?: string | null; returnAddress?: string | null },
  eventDate: Date, customRateCents: number | null | undefined, irs: RatePeriod[],
): MileageCalc | null {
  const source = m.overrideMiles != null ? 'override' : 'google';
  const toVenue = m.oneWayMiles;
  const fromVenue = m.roundTrip && toVenue != null ? (m.returnMiles ?? toVenue) : null;
  const miles = m.overrideMiles != null ? m.overrideMiles : toVenue != null ? r1(toVenue + (fromVenue ?? 0)) : null;
  if (miles == null || miles <= 0) return null;
  const d = eventDate.toISOString().slice(0, 10);
  const period = [...irs].reverse().find(p => p.from <= d) ?? null;
  const rateCents = customRateCents ?? rateOn(irs, eventDate);
  const rateSource = customRateCents != null ? 'custom' : 'irs';
  const amountCents = Math.round(miles * rateCents);
  const start = m.startAddress?.trim() ? 'your start' : 'home base';
  const back = m.returnAddress?.trim() ? 'your return address' : start;
  const distance = source === 'override'
    ? `${miles} mi (your own number)`
    : fromVenue != null
      ? `${start} → venue ${toVenue} mi + venue → ${back} ${fromVenue} mi = ${miles} mi`
      : `${start} → venue ${miles} mi (one way)`;
  const rate = rateSource === 'custom' ? `${fmtRate(rateCents)}/mi (your rate)` : `${fmtRate(rateCents)}/mi (IRS business rate from ${period?.from ?? 'the latest period'})`;
  return { miles, source, toVenue, fromVenue, roundTrip: m.roundTrip, rateCents, rateSource, ratePeriodFrom: period?.from ?? null, amountCents, text: `${distance} × ${rate}` };
}

// Ledger rows for every event with mileage (used by syncLedger)
export async function mileageRows(tenantId: string) {
  const branding = await prisma.tenantBranding.findUnique({ where: { tenantId }, select: { mileageEnabled: true, mileageRateCents: true } });
  if (branding && branding.mileageEnabled === false) return [];
  const irs = await getIrsRates();
  const list = await prisma.eventMileage.findMany({
    where: { tenantId, event: { status: { in: [...ELIGIBLE] } } },
    select: { eventId: true, oneWayMiles: true, returnMiles: true, overrideMiles: true, roundTrip: true, startAddress: true, returnAddress: true, event: { select: { title: true, eventDate: true, clientId: true } } },
  });
  return list.flatMap(m => {
    const c = mileageCalc(m, m.event.eventDate, branding?.mileageRateCents, irs);
    if (!c || c.amountCents <= 0) return [];
    return [{ eventId: m.eventId, clientId: m.event.clientId, date: m.event.eventDate, amountCents: c.amountCents, description: `Mileage: ${c.text}` }]; // the event's name shows beside it
  });
}
