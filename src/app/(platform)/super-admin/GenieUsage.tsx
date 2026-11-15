'use client';
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { fmtCents } from '@/lib/utils';

type Row = {
  eventId: string; title: string; eventDate: string; tenantId: string; operator: string; product: string;
  ipads: number; sessions: number; photos: number; texts: number; emails: number; failed: number;
  paidCents: number; payments: number; ipadsCovered: number | null;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

// Super Admin → Genie Usage: texts, emails, sessions and photos per event, and the Genie-only event price
export default function GenieUsage() {
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [price, setPrice] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setRows(null);
    const r = await fetch('/api/super-admin/genie-usage?days=' + days);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load usage'); return; }
    setRows(d.events);
    setPrice((d.priceCents / 100).toFixed(2));
  }, [days]);
  useEffect(() => { load(); }, [load]);

  async function savePrice() {
    setError(''); setSaved(false);
    const r = await fetch('/api/super-admin/genie-usage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ priceCents: Math.round(Number(price) * 100) }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not save the price'); return; }
    setSaved(true);
  }

  const sum = (k: 'texts' | 'emails' | 'sessions' | 'photos' | 'paidCents') => (rows ?? []).reduce((n, r) => n + r[k], 0);
  const paidEvents = (rows ?? []).filter(r => r.payments > 0);
  const avgTexts = paidEvents.length ? Math.round(paidEvents.reduce((n, r) => n + r.texts, 0) / paidEvents.length) : null;
  const maxTexts = (rows ?? []).reduce((m, r) => Math.max(m, r.texts), 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Genie-only event price</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-gray-500">What a Genie-only account pays per event (covers 2 iPads, texts and email). Applies to new payments. Genius accounts with Genie don&apos;t pay per event yet.</p>
          <div className="flex items-center gap-2 max-w-xs">
            <span className="text-sm text-gray-500">$</span>
            <Input type="number" min="0.5" step="0.01" value={price} onChange={e => { setPrice(e.target.value); setSaved(false); }}/>
            <Button onClick={savePrice} disabled={!price}>{saved ? '✓ Saved' : 'Save'}</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          ['Events', rows?.length ?? '—'],
          ['Paid events', rows ? paidEvents.length : '—'],
          ['Revenue', rows ? fmtCents(sum('paidCents')) : '—'],
          ['Texts (avg per paid event)', rows ? `${sum('texts')}${avgTexts !== null ? ` (${avgTexts})` : ''}` : '—'],
          ['Most texts in one event', rows ? maxTexts : '—'],
        ].map(([label, value]) => (
          <Card key={label as string}><CardContent className="py-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xl font-bold mt-1">{value}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-6 py-3 border-b">
            <p className="text-sm text-gray-500">Events with Genie set up, by event date</p>
            <select value={days} onChange={e => setDays(Number(e.target.value))} className="text-sm border border-gray-300 rounded-md px-2 py-1">
              {[30, 90, 365].map(d => <option key={d} value={d}>Last {d} days and upcoming</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-600 px-6 py-3">{error}</p>}
          {!rows ? <p className="text-sm text-gray-400 p-6">Loading…</p> : rows.length === 0 ? <p className="text-sm text-gray-500 p-6">No Genie events in this period.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead><tr className="border-b text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-6 py-3">Event</th><th className="px-3 py-3">Operator</th><th className="px-3 py-3">Paid</th>
                  <th className="px-3 py-3 text-right">iPads</th><th className="px-3 py-3 text-right">Sessions</th><th className="px-3 py-3 text-right">Photos</th>
                  <th className="px-3 py-3 text-right">Texts</th><th className="px-3 py-3 text-right">Emails</th><th className="px-6 py-3 text-right">Failed</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.eventId} className="border-b last:border-0">
                      <td className="px-6 py-2.5"><p className="font-medium text-gray-800">{r.title}</p><p className="text-xs text-gray-400">{fmtDate(r.eventDate)}</p></td>
                      <td className="px-3 py-2.5"><p className="text-gray-700">{r.operator}</p><p className="text-xs text-gray-400">{r.product === 'genie' ? 'Genie only' : 'Genius'}</p></td>
                      <td className="px-3 py-2.5">
                        {r.product !== 'genie' ? <span className="text-gray-400">—</span>
                          : r.payments > 0 ? <span className="text-gray-700">{fmtCents(r.paidCents)}{r.payments > 1 ? ` (${r.payments}×)` : ''}</span>
                          : <Badge variant="warning">Unpaid</Badge>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{r.ipads}{r.ipadsCovered !== null ? ` / ${r.ipadsCovered}` : ''}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{r.sessions}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{r.photos}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{r.texts}</td>
                      <td className="px-3 py-2.5 text-right text-gray-600">{r.emails}</td>
                      <td className="px-6 py-2.5 text-right">{r.failed > 0 ? <span className="text-[#E2445C] font-medium">{r.failed}</span> : <span className="text-gray-400">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
