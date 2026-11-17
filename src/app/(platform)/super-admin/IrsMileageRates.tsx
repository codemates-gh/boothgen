'use client';
// Super Admin → Settings: the IRS standard mileage rates Bookkeeping uses (checked weekly from the IRS page)
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Car, RefreshCw } from 'lucide-react';

type Rate = { from: string; cents: number; source?: string };

export default function IrsMileageRates() {
  const [rates, setRates] = useState<Rate[]>([]);
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [add, setAdd] = useState({ from: '', cents: '' });

  useEffect(() => { fetch('/api/super-admin/mileage-rates').then(r => r.json()).then(d => { setRates(d.rates ?? []); setSource(d.source ?? ''); }).catch(() => {}); }, []);

  async function check() {
    setBusy(true); setNote('');
    const d = await fetch('/api/super-admin/mileage-rates', { method: 'POST' }).then(r => r.json()).catch(() => ({ error: 'Check failed' }));
    if (d.rates) setRates(d.rates);
    setNote(d.error ? 'Could not read the IRS page: ' + d.error : d.added?.length ? `Added ${d.added.map((r: Rate) => `${r.cents}¢ from ${r.from}`).join(', ')}.` : 'Up to date with the IRS page.');
    setBusy(false);
  }
  async function save(next: Rate[]) {
    const d = await fetch('/api/super-admin/mileage-rates', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rates: next }) }).then(r => r.json());
    if (d.rates) setRates(d.rates);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Car className="w-4 h-4" /> IRS Mileage Rates</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-500">
          Bookkeeping&apos;s mileage log uses the IRS business rate in effect on each event&apos;s date (unless the operator sets their own).
          New rates are picked up on the 1st of each month from the <a href={source} target="_blank" rel="noopener noreferrer" className="text-[#0085FF] hover:underline">IRS page</a>; correct one here if needed.
          Operators see a note to confirm rates with the IRS and their tax professional.
        </p>
        <table className="w-full max-w-md text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-gray-400"><th className="py-1">From</th><th className="py-1">Cents per mile</th><th className="py-1">IRS notice</th></tr></thead>
          <tbody>
            {[...rates].reverse().map(r => (
              <tr key={r.from} className="border-t border-gray-100">
                <td className="py-1.5">{r.from}</td>
                <td className="py-1.5"><input type="number" step="0.5" defaultValue={r.cents} onBlur={e => { const v = parseFloat(e.target.value); if (v > 0 && v !== r.cents) save(rates.map(x => x.from === r.from ? { ...x, cents: v } : x)); }} className="w-20 border border-gray-200 rounded px-2 py-1" /></td>
                <td className="py-1.5 text-gray-500">{r.source ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="block text-xs text-gray-500 mb-1">New period from</label><input type="date" value={add.from} onChange={e => setAdd(a => ({ ...a, from: e.target.value }))} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm" /></div>
          <div><label className="block text-xs text-gray-500 mb-1">Cents per mile</label><input type="number" step="0.5" value={add.cents} onChange={e => setAdd(a => ({ ...a, cents: e.target.value }))} className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm" /></div>
          <Button variant="outline" size="sm" disabled={!add.from || !(parseFloat(add.cents) > 0)} onClick={() => { save([...rates, { from: add.from, cents: parseFloat(add.cents), source: 'Added by hand' }]); setAdd({ from: '', cents: '' }); }}>Add</Button>
          <Button variant="outline" size="sm" onClick={check} disabled={busy}><RefreshCw className={'w-3.5 h-3.5 mr-1.5 ' + (busy ? 'animate-spin' : '')} />Check IRS now</Button>
        </div>
        {note && <p className="text-sm text-gray-600">{note}</p>}
      </CardContent>
    </Card>
  );
}
