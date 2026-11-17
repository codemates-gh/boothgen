'use client';
// Mileage: the settings (on/off, IRS rate or your own) and one event's trip (start → venue → return, or your own miles)
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw } from 'lucide-react';
import { MILEAGE_DISCLAIMER, TAX_DISCLAIMER, IRS_MILEAGE_URL } from '@/lib/bookkeeping/disclaimer';

function Disclaimer() {
  return (
    <p className="text-[11px] leading-snug text-gray-400">
      {MILEAGE_DISCLAIMER} <a href={IRS_MILEAGE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">IRS standard mileage rates</a>. {TAX_DISCLAIMER}
    </p>
  );
}

type Settings = { mileageEnabled: boolean; mileageRateCents: number | null; homeBase: string | null; googleConfigured: boolean; irsRates: { from: string; cents: number; source?: string }[]; irsRateToday: number };
type Trip = {
  eventId: string; title: string; venue: string | null; homeBase: string | null; startAddress: string | null; returnAddress: string | null;
  roundTrip: boolean; overrideMiles: number | null; oneWayMiles: number | null; returnMiles: number | null; status: string; error: string | null;
  calc: { miles: number; source: string; toVenue: number | null; fromVenue: number | null; rateCents: number; rateSource: string; ratePeriodFrom: string | null; amountCents: number; text: string } | null;
};

const cents = (c: number) => (Number.isInteger(c) ? c : c.toFixed(1)) + '¢';
const label = 'block text-sm font-medium text-gray-700 mb-1';

export function MileageSettingsModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [own, setOwn] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/bookkeeping/settings').then(r => r.json()).then((d: Settings) => { setS(d); setOwn(d.mileageRateCents ? String(d.mileageRateCents) : ''); }).catch(() => {}); }, []);

  async function save(body: object) {
    setError('');
    const r = await fetch('/api/bookkeeping/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) setS(await r.json()); else setError('Could not save');
  }

  return (
    <Modal open onClose={onClose} title="Mileage">
      {!s ? <p className="text-sm text-gray-400">Loading…</p> : (
        <div className="space-y-5 text-sm">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={s.mileageEnabled} onChange={e => save({ mileageEnabled: e.target.checked })} />
            <span><span className="font-medium text-gray-800">Log mileage automatically</span><span className="block text-xs text-gray-500">Each booked event becomes a Travel &amp; Mileage expense: home base → venue → home base, at your rate per mile. You can change the start, return or miles on any event.</span></span>
          </label>

          <div>
            <p className={label}>Home base</p>
            {s.homeBase ? <p className="text-gray-700">{s.homeBase}</p> : <p className="text-amber-600">Not set yet.</p>}
            <Link href="/settings/branding" className="text-xs text-[#0085FF] hover:underline">Change in Settings → Branding (business address)</Link>
          </div>

          <div>
            <p className={label}>Rate per mile</p>
            <label className="flex items-start gap-2 mb-2">
              <input type="radio" name="rate" className="mt-1" checked={s.mileageRateCents == null} onChange={() => save({ mileageRateCents: null })} />
              <span><span className="text-gray-800">IRS standard rate (automatic)</span><span className="block text-xs text-gray-500">Currently {cents(s.irsRateToday)} per mile. Each event uses the rate in effect on its date, and new IRS rates are picked up automatically.</span></span>
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="rate" checked={s.mileageRateCents != null} onChange={() => { if (!own) setOwn(String(Math.round(s.irsRateToday))); save({ mileageRateCents: Math.round(Number(own) || s.irsRateToday) }); }} />
              <span className="text-gray-800">My own rate:</span>
              <Input className="h-8 w-20" inputMode="numeric" value={own} onChange={e => setOwn(e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => { if (s.mileageRateCents != null && Number(own) > 0) save({ mileageRateCents: Number(own) }); }} />
              <span className="text-gray-500">¢ per mile</span>
            </label>
          </div>

          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer select-none">IRS business rates</summary>
            <ul className="mt-2 space-y-0.5">{[...s.irsRates].reverse().map(r => <li key={r.from}>From {r.from}: {cents(r.cents)} per mile</li>)}</ul>
          </details>

          {!s.googleConfigured && <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">Distances aren&apos;t being looked up yet: Google Maps isn&apos;t connected. You can still type your own miles on any event.</p>}
          {error && <p className="text-red-600">{error}</p>}
          <Disclaimer />
          <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
        </div>
      )}
    </Modal>
  );
}

export function MileageTripModal({ eventId, fmt, onClose, onSaved }: { eventId: string; fmt: (c: number) => string; onClose: () => void; onSaved: () => void }) {
  const [t, setT] = useState<Trip | null>(null);
  const [form, setForm] = useState({ startAddress: '', returnAddress: '', roundTrip: true, overrideMiles: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fill = (d: Trip) => { setT(d); setForm({ startAddress: d.startAddress ?? '', returnAddress: d.returnAddress ?? '', roundTrip: d.roundTrip, overrideMiles: d.overrideMiles != null ? String(d.overrideMiles) : '' }); };
  useEffect(() => { fetch('/api/bookkeeping/mileage/' + eventId).then(r => r.json()).then(fill).catch(() => {}); }, [eventId]);

  async function save(recalculate = false) {
    setBusy(true); setError('');
    const miles = form.overrideMiles.trim() ? parseFloat(form.overrideMiles) : null;
    if (miles != null && !(miles >= 0)) { setError('Enter miles as a number'); setBusy(false); return; }
    const r = await fetch('/api/bookkeeping/mileage/' + eventId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ startAddress: form.startAddress.trim() || null, returnAddress: form.returnAddress.trim() || null, roundTrip: form.roundTrip, overrideMiles: miles, recalculate }) });
    setBusy(false);
    if (!r.ok) { setError('Could not save'); return; }
    fill(await r.json());
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title="Mileage">
      {!t ? <p className="text-sm text-gray-400">Loading…</p> : (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-gray-50 px-3 py-2.5">
            <p className="font-medium text-[#1F1F3D]">{t.title}</p>
            <p className="text-xs text-gray-500">Venue: {t.venue ?? 'no address on the event'}</p>
          </div>

          {/* How it's worked out */}
          {t.calc ? (
            <div className="rounded-lg border border-gray-200 px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">How it&apos;s worked out</p>
              <p className="text-gray-700">{t.calc.text}</p>
              <p className="font-semibold text-[#1F1F3D]">= {fmt(t.calc.amountCents)}</p>
              <p className="text-xs text-gray-500">{t.calc.source === 'override' ? 'Using your own miles.' : 'Driving distance from Google Maps.'} {t.calc.rateSource === 'irs' ? `IRS standard business rate in effect on the event date (from ${t.calc.ratePeriodFrom}).` : 'Your own rate per mile (Mileage settings).'}</p>
            </div>
          ) : (
            <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">{t.error ?? 'No distance yet.'} You can type your own miles below.</p>
          )}

          <div>
            <label className={label}>Start</label>
            <Input value={form.startAddress} onChange={e => setForm(f => ({ ...f, startAddress: e.target.value }))} placeholder={t.homeBase ? `Home base: ${t.homeBase}` : 'Home base (set it in Settings → Branding)'} />
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.roundTrip} onChange={e => setForm(f => ({ ...f, roundTrip: e.target.checked }))} />
            <span className="text-gray-800">Round trip (count the drive back too)</span>
          </label>
          {form.roundTrip && (
            <div>
              <label className={label}>Return to</label>
              <Input value={form.returnAddress} onChange={e => setForm(f => ({ ...f, returnAddress: e.target.value }))} placeholder="Same as the start" />
            </div>
          )}
          <div>
            <label className={label}>My own miles <span className="font-normal text-gray-400">(optional, the whole trip)</span></label>
            <Input inputMode="decimal" value={form.overrideMiles} onChange={e => setForm(f => ({ ...f, overrideMiles: e.target.value }))} placeholder={t.calc && t.calc.source !== 'override' ? `Google: ${t.calc.miles} mi` : 'e.g. 48.5'} />
            <p className="text-xs text-gray-400 mt-1">Leave empty to use the driving distance.</p>
          </div>
          {error && <p className="text-red-600">{error}</p>}
          <Disclaimer />
          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="outline" size="sm" onClick={() => save(true)} disabled={busy}><RefreshCw className="w-3.5 h-3.5 mr-1.5" />Recalculate distance</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => save(false)} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
