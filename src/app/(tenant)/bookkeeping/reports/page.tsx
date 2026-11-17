'use client';
// Bookkeeping → Reports: Profit & Loss (by category, month by month) and Client Sales, with CSV downloads
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { fmtCents } from '@/lib/utils';
import { ArrowLeft, Download } from 'lucide-react';

type Line = { name: string; byMonth: Record<string, number>; total: number };
type PL = { months: string[]; income: Line[]; expense: Line[]; totalIncome: number; totalExpense: number; net: number };
type Clients = { clients: { name: string; cents: number; count: number }[]; total: number };

const iso = (d: Date) => d.toISOString().slice(0, 10);
function presetRange(p: string): { from: string; to: string } {
  const now = new Date(); const y = now.getFullYear();
  if (p === 'this-year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (p === 'last-year') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  if (p === 'this-quarter') { const q = Math.floor(now.getMonth() / 3); return { from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) }; }
  if (p === 'last-12') return { from: iso(new Date(y, now.getMonth() - 11, 1)), to: iso(now) };
  return { from: iso(new Date(y, now.getMonth(), 1)), to: iso(new Date(y, now.getMonth() + 1, 0)) }; // this month
}
const monthLabel = (m: string) => new Date(m + '-01T12:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

export default function BookkeepingReportsPage() {
  const [report, setReport] = useState<'pl' | 'clients'>('pl');
  const [preset, setPreset] = useState('this-year');
  const [range, setRange] = useState(presetRange('this-year'));
  const [pl, setPl] = useState<PL | null>(null);
  const [clients, setClients] = useState<Clients | null>(null);
  const [currency, setCurrency] = useState('usd');
  const fmt = (c: number) => fmtCents(c, currency);

  useEffect(() => { fetch('/api/settings/branding').then(r => r.json()).then(b => { if (b?.currency) setCurrency(b.currency); }).catch(() => {}); }, []);
  useEffect(() => {
    const qs = new URLSearchParams({ report, ...range });
    fetch('/api/bookkeeping/reports?' + qs).then(r => r.json()).then(d => (report === 'pl' ? setPl(d) : setClients(d))).catch(() => {});
  }, [report, range]);

  const csvHref = '/api/bookkeeping/reports?' + new URLSearchParams({ report, ...range, format: 'csv' });
  const th = 'px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wide text-gray-400 whitespace-nowrap';
  const td = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';

  const section = (title: string, lines: Line[], total: number, months: string[], tone: string) => (
    <>
      <tr className="bg-gray-50"><td colSpan={months.length + 2} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</td></tr>
      {lines.length === 0 && <tr><td colSpan={months.length + 2} className="px-3 py-2 text-sm text-gray-400">None in this period</td></tr>}
      {lines.map(l => (
        <tr key={l.name} className="border-b border-gray-100">
          <td className="px-3 py-2 text-sm sticky left-0 bg-white">{l.name}</td>
          {months.map(m => <td key={m} className={td + ' text-sm text-gray-600'}>{l.byMonth[m] ? fmt(l.byMonth[m]) : '—'}</td>)}
          <td className={td + ' text-sm font-medium'}>{fmt(l.total)}</td>
        </tr>
      ))}
      <tr className="border-b border-gray-200">
        <td className="px-3 py-2 text-sm font-semibold sticky left-0 bg-white">Total {title.toLowerCase()}</td>
        {months.map(m => <td key={m} className={td + ' text-sm font-semibold'}>{fmt(lines.reduce((n, l) => n + (l.byMonth[m] ?? 0), 0))}</td>)}
        <td className={td + ' text-sm font-bold ' + tone}>{fmt(total)}</td>
      </tr>
    </>
  );

  return (
    <>
      <TopBar title="Bookkeeping Reports" />
      <div className="p-4 sm:p-8 space-y-5">
        <Link href="/bookkeeping" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" />Back to Bookkeeping</Link>

        <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
          <div className="flex flex-shrink-0 border-b border-gray-200">
            {([['pl', 'Profit & Loss'], ['clients', 'Client Sales']] as const).map(([r, label]) => (
              <button key={r} onClick={() => setReport(r)} className={'px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px ' + (report === r ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select className="w-auto" value={preset} onChange={e => { setPreset(e.target.value); if (e.target.value !== 'custom') setRange(presetRange(e.target.value)); }} aria-label="Period">
              <option value="this-month">This month</option><option value="this-quarter">This quarter</option><option value="this-year">This year</option>
              <option value="last-12">Last 12 months</option><option value="last-year">Last year</option><option value="custom">Custom</option>
            </Select>
            <Input type="date" className="w-auto" aria-label="From" value={range.from} onChange={e => { setPreset('custom'); setRange(r => ({ ...r, from: e.target.value })); }} />
            <Input type="date" className="w-auto" aria-label="To" value={range.to} onChange={e => { setPreset('custom'); setRange(r => ({ ...r, to: e.target.value })); }} />
            <a href={csvHref}><Button variant="outline" size="sm"><Download className="w-3.5 h-3.5 mr-1.5" />CSV</Button></a>
          </div>
        </div>

        {report === 'pl' && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {[['Income', pl?.totalIncome ?? 0, 'text-green-600'], ['Expenses', pl?.totalExpense ?? 0, 'text-red-600'], ['Net profit', pl?.net ?? 0, (pl?.net ?? 0) < 0 ? 'text-red-600' : 'text-[#1F1F3D]']].map(([label, c, cls]) => (
                <Card key={label as string}><CardContent className="pt-4 pb-4"><p className="text-xs uppercase tracking-wide text-gray-400">{label as string}</p><p className={'text-lg sm:text-2xl font-bold ' + cls}>{fmt(c as number)}</p></CardContent></Card>
              ))}
            </div>
            <Card>
              <CardHeader><CardTitle>Profit &amp; Loss</CardTitle></CardHeader>
              <CardContent className="p-0">
                {!pl ? <p className="px-6 pb-6 text-sm text-gray-400">Loading…</p> : (
                  <div className="overflow-x-auto"><table className="w-full">
                    <thead><tr className="border-b border-gray-200"><th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-gray-400 sticky left-0 bg-white">Category</th>{pl.months.map(m => <th key={m} className={th}>{monthLabel(m)}</th>)}<th className={th}>Total</th></tr></thead>
                    <tbody>
                      {section('Income', pl.income, pl.totalIncome, pl.months, 'text-green-600')}
                      {section('Expenses', pl.expense, pl.totalExpense, pl.months, 'text-red-600')}
                      <tr className="bg-gray-50">
                        <td className="px-3 py-2.5 text-sm font-bold sticky left-0 bg-gray-50">Net profit</td>
                        {pl.months.map(m => { const n = pl.income.reduce((a, l) => a + (l.byMonth[m] ?? 0), 0) - pl.expense.reduce((a, l) => a + (l.byMonth[m] ?? 0), 0); return <td key={m} className={td + ' text-sm font-semibold ' + (n < 0 ? 'text-red-600' : '')}>{fmt(n)}</td>; })}
                        <td className={td + ' text-sm font-bold ' + (pl.net < 0 ? 'text-red-600' : 'text-[#1F1F3D]')}>{fmt(pl.net)}</td>
                      </tr>
                    </tbody>
                  </table></div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {report === 'clients' && (
          <Card>
            <CardHeader><CardTitle>Client Sales</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!clients ? <p className="px-6 pb-6 text-sm text-gray-400">Loading…</p> : clients.clients.length === 0 ? <p className="px-6 pb-6 text-sm text-gray-400">No income in this period.</p> : (
                <ul className="divide-y divide-gray-100">
                  {clients.clients.map(c => (
                    <li key={c.name} className="flex items-center gap-3 px-6 py-3 text-sm">
                      <span className="flex-1 min-w-0 truncate font-medium">{c.name}</span>
                      <span className="text-xs text-gray-400">{c.count} payment{c.count === 1 ? '' : 's'}</span>
                      <span className="w-28 text-right font-semibold tabular-nums">{fmt(c.cents)}</span>
                    </li>
                  ))}
                  <li className="flex items-center gap-3 px-6 py-3 text-sm bg-gray-50"><span className="flex-1 font-semibold">Total</span><span className="w-28 text-right font-bold tabular-nums">{fmt(clients.total)}</span></li>
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
