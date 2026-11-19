'use client';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fmtCents } from '@/lib/utils';

export type AiSettingsView = {
  ready: boolean; rendersIncluded: number; topUpRenders: number; topUpPriceCents: number; trialRenders: number;
  fastModel: string; qualityModel: string; fastCostCents: number; qualityCostCents: number;
};
export type AiUsageRow = { eventId: string; title: string; eventDate: string; operator: string; done: number; blocked: number; failed: number; trial: number; costCents: number };

const dollars = (c: number) => (c / 100).toFixed(2);
const cents = (s: string) => Math.round(Number(s) * 100);
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

// Super Admin → Genie Usage → Geniefied (Genie P13): the add-on's price and allowance, top-up packs, the trial for unpaid
// events, the Google models and their estimated costs, the "available" switch and the usage ledger
export function GeniefiedCard({ ai, priceCents, usage, onSaved }: { ai: AiSettingsView; priceCents: number; usage: AiUsageRow[]; onSaved: () => void }) {
  const toForm = () => ({
    price: dollars(priceCents), rendersIncluded: String(ai.rendersIncluded), topUpRenders: String(ai.topUpRenders), topUpPrice: dollars(ai.topUpPriceCents),
    trialRenders: String(ai.trialRenders), fastModel: ai.fastModel, qualityModel: ai.qualityModel, fastCost: dollars(ai.fastCostCents), qualityCost: dollars(ai.qualityCostCents),
  });
  const [f, setF] = useState(toForm);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setF(toForm()); }, [ai, priceCents]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); setSaved(false); };

  async function patch(body: object) {
    setError('');
    const r = await fetch('/api/super-admin/genie-usage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not save'); return false; }
    onSaved();
    return true;
  }
  async function save() {
    const ok = await patch({
      addOnPrices: { geniefied: cents(f.price) },
      ai: {
        rendersIncluded: Number(f.rendersIncluded), topUpRenders: Number(f.topUpRenders), topUpPriceCents: cents(f.topUpPrice), trialRenders: Number(f.trialRenders),
        fastModel: f.fastModel.trim(), qualityModel: f.qualityModel.trim(), fastCostCents: cents(f.fastCost), qualityCostCents: cents(f.qualityCost),
      },
    });
    if (ok) setSaved(true);
  }
  async function toggleReady() {
    if (!ai.ready && !confirm('Operators will be able to turn on Geniefied and buy it for their events. Turn it on?')) return;
    await patch({ ai: { ready: !ai.ready } });
  }

  const field = (label: string, k: keyof typeof f, opts: { money?: boolean; hint?: string } = {}) => (
    <label className="space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="flex items-center gap-2">
        {opts.money && <span className="text-sm text-gray-500">$</span>}
        <Input value={f[k]} type={k.endsWith('Model') ? 'text' : 'number'} min="0" step={opts.money ? '0.01' : '1'} onChange={e => set(k, e.target.value)}/>
      </div>
      {opts.hint && <span className="block text-xs text-gray-500">{opts.hint}</span>}
    </label>
  );
  const totals = usage.reduce((t, r) => ({ done: t.done + r.done, blocked: t.blocked + r.blocked, failed: t.failed + r.failed, cost: t.cost + r.costCents }), { done: 0, blocked: 0, failed: 0, cost: 0 });

  return (
    <Card>
      <CardHeader><CardTitle>Geniefied (AI photo booth)</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-500">A per-event add-on: guests restyle their photos in the event's themes. Each photo rendered is one render; blocked and failed renders don't count. Themes are in the AI themes tab.</p>
        <div className="grid sm:grid-cols-3 gap-4 max-w-3xl">
          {field('Price per event', 'price', { money: true })}
          {field('Renders included', 'rendersIncluded')}
          {field('Trial renders (unpaid event)', 'trialRenders', { hint: 'Watermarked, like the rest of an unpaid event.' })}
          {field('Top-up pack: renders', 'topUpRenders')}
          {field('Top-up pack: price', 'topUpPrice', { money: true })}
        </div>
        <div className="grid sm:grid-cols-2 gap-4 max-w-3xl border-t pt-4">
          {field('Fast model (1–2 people)', 'fastModel')}
          {field('Quality model (3+ people, or none found)', 'qualityModel')}
          {field('Estimated cost per fast render', 'fastCost', { money: true })}
          {field('Estimated cost per quality render', 'qualityCost', { money: true })}
        </div>
        <p className="text-xs text-gray-500">Google image models on the Gemini paid tier (needs billing on the Google project behind GEMINI_API_KEY; the free tier trains on inputs). A theme can use its own models.</p>
        <Button onClick={save}>{saved ? '✓ Saved' : 'Save Geniefied settings'}</Button>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-start justify-between gap-4 border-t pt-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Geniefied available</p>
            <p className="text-sm text-gray-500">{ai.ready
              ? 'On: operators can turn on Geniefied for their events and buy it.'
              : "Off: operators can't turn Geniefied on yet (events that already have it keep it)."}</p>
          </div>
          <Button variant={ai.ready ? 'outline' : 'default'} onClick={toggleReady}>{ai.ready ? 'Turn off' : 'Turn on'}</Button>
        </div>
        <div className="border-t pt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Renders by event</p>
          {usage.length === 0 ? <p className="text-sm text-gray-400">No renders in this period.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-3">Event</th><th className="py-1 pr-3">Operator</th><th className="py-1 pr-3 text-right">Done</th><th className="py-1 pr-3 text-right">Trial</th><th className="py-1 pr-3 text-right">Blocked</th><th className="py-1 pr-3 text-right">Failed</th><th className="py-1 text-right">Est. cost</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {usage.map(r => (
                    <tr key={r.eventId}><td className="py-1.5 pr-3">{r.title} <span className="text-gray-400">· {fmtDate(r.eventDate)}</span></td><td className="py-1.5 pr-3 text-gray-600">{r.operator}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{r.done}</td><td className="py-1.5 pr-3 text-right tabular-nums">{r.trial}</td><td className="py-1.5 pr-3 text-right tabular-nums">{r.blocked}</td><td className="py-1.5 pr-3 text-right tabular-nums">{r.failed}</td><td className="py-1.5 text-right tabular-nums">{fmtCents(r.costCents)}</td></tr>
                  ))}
                  <tr className="font-medium"><td className="py-1.5 pr-3" colSpan={2}>Total</td><td className="py-1.5 pr-3 text-right tabular-nums">{totals.done}</td><td/><td className="py-1.5 pr-3 text-right tabular-nums">{totals.blocked}</td><td className="py-1.5 pr-3 text-right tabular-nums">{totals.failed}</td><td className="py-1.5 text-right tabular-nums">{fmtCents(totals.cost)}</td></tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
