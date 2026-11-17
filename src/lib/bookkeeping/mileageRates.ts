// IRS standard mileage rate for business use, by period. Each event's mileage uses the rate in effect on its date.
// Kept up to date by a monthly check of the IRS page (checkIrsRates, run by Inngest), with these as the built-in
// starting point; Super Admin → Settings shows them and can correct them.
import { prisma } from '@/lib/prisma/client';

export type RatePeriod = { from: string; cents: number; source?: string }; // from = YYYY-MM-DD

export const IRS_RATES_URL = 'https://www.irs.gov/tax-professionals/standard-mileage-rates';
const SETTING_KEY = 'irs_mileage_rates';

export const BUILT_IN_RATES: RatePeriod[] = [
  { from: '2022-01-01', cents: 58.5 }, { from: '2022-07-01', cents: 62.5 }, { from: '2023-01-01', cents: 65.5 },
  { from: '2024-01-01', cents: 67 }, { from: '2025-01-01', cents: 70 }, { from: '2026-01-01', cents: 72.5 },
  { from: '2026-07-01', cents: 76 },
];

const merge = (...lists: RatePeriod[][]) => {
  const by = new Map<string, RatePeriod>();
  for (const l of lists) for (const p of l) by.set(p.from, p);
  return [...by.values()].sort((a, b) => a.from.localeCompare(b.from));
};

export async function getIrsRates(): Promise<RatePeriod[]> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  let saved: RatePeriod[] = [];
  try { saved = row ? JSON.parse(row.value) : []; } catch { saved = []; }
  return merge(BUILT_IN_RATES, saved.filter(p => /^\d{4}-\d{2}-\d{2}$/.test(p.from) && p.cents > 0));
}

export async function saveIrsRates(periods: RatePeriod[]) {
  const value = JSON.stringify(merge(periods));
  await prisma.systemSetting.upsert({ where: { key: SETTING_KEY }, update: { value }, create: { key: SETTING_KEY, value } });
}

// The rate (cents per mile) in effect on a date
export function rateOn(rates: RatePeriod[], date: Date): number {
  const d = date.toISOString().slice(0, 10);
  let rate = rates[0]?.cents ?? 70;
  for (const p of rates) if (p.from <= d) rate = p.cents;
  return rate;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');

// When a period on the IRS table starts: "2025", "2026 (July 1 – Dec. 31)", "7/1/2022-12/31/2022"
export function periodStart(label: string): string | null {
  const t = label.replace(/\s+/g, ' ').trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}`;
  m = t.match(/^(\d{4})\s*\(\s*([A-Za-z]+)\.?\s*(\d{1,2})/);
  if (m) {
    const name = m[2].toLowerCase();
    const mon = MONTHS[name] ?? MONTHS[name.slice(0, 3)];
    if (mon) return `${m[1]}-${pad(mon)}-${pad(+m[3])}`;
  }
  m = t.match(/^(\d{4})$/);
  if (m) return `${m[1]}-01-01`;
  return null;
}

// Business-use rates from the IRS page's table: [{ from, cents, source }]
export function parseIrsRatesPage(html: string): RatePeriod[] {
  const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&ndash;|&#8211;/g, '–').replace(/\s+/g, ' ').trim();
  const out: RatePeriod[] = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map(text);
    if (cells.length < 2) continue;
    const from = periodStart(cells[0]);
    const cents = parseFloat(cells[1]);
    if (!from || !Number.isFinite(cents) || cents < 20 || cents > 200) continue;
    out.push({ from, cents, source: cells[4] || undefined });
  }
  return out;
}

// Weekly: read the IRS page and add any period BoothGen doesn't have yet. Returns what was added.
export async function checkIrsRates(fetcher: typeof fetch = fetch): Promise<{ added: RatePeriod[]; error?: string }> {
  try {
    const res = await fetcher(IRS_RATES_URL, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BoothGen/1.0)' } });
    if (!res.ok) return { added: [], error: 'IRS page returned ' + res.status };
    const found = parseIrsRatesPage(await res.text());
    if (found.length === 0) return { added: [], error: 'No rates found on the IRS page (its layout may have changed)' };
    const current = await getIrsRates();
    const have = new Map(current.map(p => [p.from, p.cents]));
    const added = found.filter(p => have.get(p.from) !== p.cents);
    if (added.length) await saveIrsRates([...current, ...added]);
    return { added };
  } catch (e) {
    return { added: [], error: (e as Error).message };
  }
}
