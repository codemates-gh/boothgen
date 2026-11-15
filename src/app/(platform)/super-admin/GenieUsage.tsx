'use client';
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { fmtCents } from '@/lib/utils';

type Row = {
  eventId: string; title: string; eventDate: string; tenantId: string; operator: string; product: string;
  ipads: number; sessions: number; photos: number; texts: number; emails: number; failed: number;
  paidCents: number; payments: number; ipadsCovered: number | null;
  paymentList: { id: string; amountCents: number; status: string; paidAt: string | null; comp: boolean }[];
  started: boolean;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

// Super Admin → Genie Usage: texts, emails, sessions and photos per event, and the Genie-only event price
export default function GenieUsage() {
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [price, setPrice] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<{ row: Row; payment: Row['paymentList'][number] } | null>(null);

  // Comp (mark paid at $0) or refund, then reload
  async function act(body: { action: 'comp'; eventId: string } | { action: 'refund'; paymentId: string }) {
    setBusy(body.action === 'comp' ? body.eventId : body.paymentId); setError('');
    const r = await fetch('/api/super-admin/genie-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(null); setRefunding(null);
    if (!r.ok) { setError(d.error || 'Could not do that'); return; }
    load();
  }

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
                        {r.product !== 'genie' ? <span className="text-gray-400">—</span> : (
                          <div className="space-y-1">
                            {r.payments === 0 && <Badge variant="warning">Unpaid</Badge>}
                            {r.paymentList.map(p => (
                              <div key={p.id} className="flex items-center gap-2 whitespace-nowrap">
                                <span className={p.status !== 'paid' ? 'text-gray-400 line-through' : 'text-gray-700'}>{p.comp ? 'Comp' : fmtCents(p.amountCents)}</span>
                                {p.status === 'disputed' ? <Badge variant="danger">Disputed</Badge>
                                  : p.status === 'refunded' ? <span className="text-xs text-gray-400">{p.comp ? 'removed' : 'refunded'}</span>
                                  : <button onClick={() => setRefunding({ row: r, payment: p })} disabled={!!busy} className="text-xs text-[#E2445C] hover:underline">{p.comp ? 'Remove' : 'Refund'}</button>}
                              </div>
                            ))}
                            <button onClick={() => act({ action: 'comp', eventId: r.eventId })} disabled={!!busy} className="text-xs text-brand hover:underline">{busy === r.eventId ? 'Comping…' : r.payments === 0 ? 'Comp event' : 'Comp 2 more iPads'}</button>
                          </div>
                        )}
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

      <Modal open={!!refunding} onClose={() => setRefunding(null)} title={refunding?.payment.comp ? 'Remove Comp' : 'Refund Payment'}>
        {refunding && (
          <>
            <p className="text-sm text-gray-600 mb-2">
              {refunding.payment.comp
                ? <>Remove the comp on <span className="font-medium text-gray-800">{refunding.row.title}</span> ({refunding.row.operator})?</>
                : <>Refund <span className="font-medium text-gray-800">{fmtCents(refunding.payment.amountCents)}</span> to {refunding.row.operator} for <span className="font-medium text-gray-800">{refunding.row.title}</span>? Stripe returns it to their card in full.</>}
            </p>
            {/* What the event already used, so a refund after the fact is a deliberate choice */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {([['Sessions', refunding.row.sessions], ['Photos', refunding.row.photos], ['Texts', refunding.row.texts], ['Emails', refunding.row.emails]] as const).map(([l, v]) => (
                <div key={l} className="bg-gray-50 rounded-lg px-3 py-2"><p className="text-[11px] text-gray-500">{l}</p><p className="font-bold text-gray-900">{v}</p></div>
              ))}
            </div>
            {(refunding.row.started || refunding.row.sessions > 0) && !refunding.payment.comp && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                {refunding.row.sessions > 0 ? `This event already has ${refunding.row.sessions} guest session${refunding.row.sessions === 1 ? '' : 's'}.` : 'This event has already started.'} The refund policy covers events refunded before they start and before any photos. Photos already taken without the watermark keep it off, even after a refund.
              </p>
            )}
            <p className="text-sm text-gray-600 mb-5">Unless the event has another payment, it goes back to unpaid and the iPads show the watermark again from their next sync.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRefunding(null)}>Cancel</Button>
              <Button variant="destructive" disabled={!!busy} onClick={() => act({ action: 'refund', paymentId: refunding.payment.id })}>{busy ? 'Working…' : refunding.payment.comp ? 'Remove Comp' : 'Refund'}</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
