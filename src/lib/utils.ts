
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
const CURRENCY_LOCALE: Record<string, string> = {
  usd: 'en-US', cad: 'en-CA',
};
export function addressLabels(country: string | null | undefined) {
  if (country === 'CA') return { stateLabel: 'Province',         postalLabel: 'Postal Code', statePh: 'ON',    postalPh: 'M5V 2T6' };
  if (country === 'US') return { stateLabel: 'State',            postalLabel: 'Zip Code',    statePh: 'TX',    postalPh: '78701'   };
  return                       { stateLabel: 'Province / State', postalLabel: 'Postal Code', statePh: 'ON',    postalPh: 'M5V'     };
}
export function fmtCents(cents: number, currency = 'usd') {
  const cur = currency.toLowerCase();
  const locale = CURRENCY_LOCALE[cur] ?? 'en-US';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: cur.toUpperCase() }).format(cents / 100);
}
export function fmtDate(d: Date | string, fmt = 'MMM d, yyyy') {
  const { format } = require('date-fns');
  return format(new Date(d), fmt);
}
// Use for date-only fields (eventDate, etc.) — avoids UTC midnight rolling to prior day in local TZ
export function parseEventDate(d: Date | string): Date {
  const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  return new Date(iso + 'T12:00:00');
}
// Event start/end times are saved as the wall-clock time in UTC (the server reads "date + T + HH:MM" on a UTC
// clock) and the event page shows them in UTC. Read them back the same way for <input type="time">, never in
// the browser's own time zone, or the edit form shows (and re-saves) shifted times.
export function eventTimeInput(dt: Date | string | null | undefined): string {
  if (!dt) return '';
  const d = new Date(dt);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(11, 16);
}
export function fmtEventDate(d: Date | string, fmt = 'MMM d, yyyy') {
  const { format } = require('date-fns');
  return format(parseEventDate(d), fmt);
}
export function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
