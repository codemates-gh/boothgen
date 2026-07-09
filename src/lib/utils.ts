
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
const CURRENCY_LOCALE: Record<string, string> = {
  usd: 'en-US', cad: 'en-CA', gbp: 'en-GB', eur: 'en-IE', aud: 'en-AU', nzd: 'en-NZ',
};
export function fmtCents(cents: number, currency = 'usd') {
  const cur = currency.toLowerCase();
  const locale = CURRENCY_LOCALE[cur] ?? 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: cur.toUpperCase() }).format(cents / 100);
}
export function fmtDate(d: Date | string, fmt = 'MMM d, yyyy') {
  const { format } = require('date-fns');
  return format(new Date(d), fmt);
}
export function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
