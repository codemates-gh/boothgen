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
import { ArrowLeft, Download, Printer, CheckCircle2, AlertCircle } from 'lucide-react';
import { MILEAGE_DISCLAIMER, TAX_DISCLAIMER, IRS_MILEAGE_URL } from '@/lib/bookkeeping/disclaimer';

type Line = { name: string; byMonth: Record<string, number>; total: number };
type PL = { months: string[]; income: Line[]; expense: Line[]; totalIncome: number; totalExpense: number; net: number };
type Clients = { clients: { name: string; cents: number; count: number }[]; total: number };
type YearSummary = {
  year: number; firstYear: number; grossIncome: number; refunds: number; totalIncome: number; totalExpense: number; net: number;
  quarters: { quarter: number; income: number; expense: number; net: number }[];
  incomeByCategory: { name: string; cents: number }[]; expenseByCategory: { name: string; cents: number }[];
  topClients: { name: string; cents: number }[]; events: number; avgPerEvent: number; transactions: number;
  todo: { uncategorized: number; expensesWithoutReceipt: number; unverified: number };
};

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
  const [report, setReport] = useState<'pl' | 'clients' | 'year'>('pl');
  const [year, setYear] = useState(new Date().getFullYear());
  const [summary, setSummary] = useState<YearSummary | null>(null);
  const [preset, setPreset] = useState('this-year');
  const [range, setRange] = useState(presetRange('this-year'));
  const [pl, setPl] = useState<PL | null>(null);
  const [clients, setClients] = useState<Clients | null>(null);
  const [currency, setCurrency] = useState('usd');
  const fmt = (c: number) => fmtCents(c, currency);

  useEffect(() => { fetch('/api/settings/branding').then(r => r.json()).then(b => { if (b?.currency) setCurrency(b.currency); }).catch(() => {}); }, []);
  useEffect(() => {
    const qs = report === 'year' ? new URLSearchParams({ report, year: String(year) }) : new URLSearchParams({ report, ...range });
    fetch('/api/bookkeeping/reports?' + qs).then(r => r.json()).then(d => (report === 'pl' ? setPl(d) : report === 'clients' ? setClients(d) : setSummary(d))).catch(() => {});
  }, [report, range, year]);

  const csvHref = '/api/bookkeeping/reports?' + (report === 'year' ? new URLSearchParams({ report, year: String(year), format: 'csv' }) : new URLSearchParams({ report, ...range, format: 'csv' }));
  const thisYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: thisYear - Math.min(summary?.firstYear ?? thisYear, thisYear) + 1 }, (_, i) => thisYear - i);
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
        <Link href="/bookkeeping" className="print:hidden inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"><ArrowLeft className="w-4 h-4" />Back to Bookkeeping</Link>

        <div className="print:hidden flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
          <div className="flex flex-shrink-0 border-b border-gray-200">
            {([['pl', 'Profit & Loss'], ['clients', 'Client Sales'], ['year', 'Year-End Summary']] as const).map(([r, label]) => (
              <button key={r} onClick={() => setReport(r)} className={'px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px ' + (report === r ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>{label}</button>
            ))}
          </div>
          {report === 'year' ? (
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <Select className="w-auto" value={year} onChange={e => setYear(parseInt(e.target.value, 10))} aria-label="Year">
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
              <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="w-3.5 h-3.5 mr-1.5" />Print</Button>
              <a href={csvHref}><Button variant="outline" size="sm"><Download className="w-3.5 h-3.5 mr-1.5" />CSV</Button></a>
            </div>
          ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select className="w-auto" value={preset} onChange={e => { setPreset(e.target.value); if (e.target.value !== 'custom') setRange(presetRange(e.target.value)); }} aria-label="Period">
              <option value="this-month">This month</option><option value="this-quarter">This quarter</option><option value="this-year">This year</option>
              <option value="last-12">Last 12 months</option><option value="last-year">Last year</option><option value="custom">Custom</option>
            </Select>
            <Input type="date" className="w-auto" aria-label="From" value={range.from} onChange={e => { setPreset('custom'); setRange(r => ({ ...r, from: e.target.value })); }} />
            <Input type="date" className="w-auto" aria-label="To" value={range.to} onChange={e => { setPreset('custom'); setRange(r => ({ ...r, to: e.target.value })); }} />
            <a href={csvHref}><Button variant="outline" size="sm"><Download className="w-3.5 h-3.5 mr-1.5" />CSV</Button></a>
          </div>
          )}
        </div>

        {report === 'year' && (!summary ? <p className="text-sm text-gray-400">Loading…</p> : (
          <div className="space-y-5">
            <h2 className="text-xl font-bold text-[#1F1F3D]">Year-End Summary {summary.year}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[['Income', summary.totalIncome, 'text-green-600', summary.refunds ? `after ${fmt(summary.refunds)} in refunds` : ''],
                ['Expenses', summary.totalExpense, 'text-red-600', ''],
                ['Net profit', summary.net, summary.net < 0 ? 'text-red-600' : 'text-[#1F1F3D]', summary.totalIncome ? `${Math.round((summary.net / summary.totalIncome) * 100)}% margin` : ''],
                ['Events', summary.events, 'text-[#1F1F3D]', summary.events ? `avg ${fmt(summary.avgPerEvent)} each` : '']].map(([label, v, cls, sub]) => (
                <Card key={label as string}><CardContent className="pt-4 pb-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400">{label as string}</p>
                  <p className={'text-lg sm:text-2xl font-bold ' + cls}>{label === 'Events' ? (v as number) : fmt(v as number)}</p>
                  {sub && <p className="text-xs text-gray-500 mt-0.5">{sub as string}</p>}
                </CardContent></Card>
              ))}
            </div>

            <Card className="print:hidden">
              <CardHeader><CardTitle>Before you send this to your accountant</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {[[summary.todo.uncategorized, ['transaction', 'transactions'], 'still to be categorized', '/bookkeeping'],
                  [summary.todo.expensesWithoutReceipt, ['expense entered by hand', 'expenses entered by hand'], 'without a receipt', '/bookkeeping'],
                  [summary.todo.unverified, ['transaction', 'transactions'], 'not verified yet', '/bookkeeping']].map(([n, noun, what, href]) => (
                  <p key={what as string} className="flex items-center gap-2">
                    {(n as number) === 0 ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertCircle className="w-4 h-4 text-amber-500" />}
                    {(n as number) === 0 ? <span className="text-gray-600">Nothing {what as string}</span>
                      : <Link href={href as string} className="text-[#1F1F3D] hover:underline">{n as number} {(noun as string[])[(n as number) === 1 ? 0 : 1]} {what as string}</Link>}
                  </p>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>By quarter</CardTitle></CardHeader>
              <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200"><th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-gray-400">Quarter</th><th className={th}>Income</th><th className={th}>Expenses</th><th className={th}>Net</th></tr></thead>
                <tbody>{summary.quarters.map(q => (
                  <tr key={q.quarter} className="border-b border-gray-100 last:border-0"><td className="px-4 py-2">Q{q.quarter}</td><td className={td}>{fmt(q.income)}</td><td className={td}>{fmt(q.expense)}</td><td className={td + ' font-medium ' + (q.net < 0 ? 'text-red-600' : '')}>{fmt(q.net)}</td></tr>
                ))}</tbody>
              </table></div></CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {([['Income by category', summary.incomeByCategory], ['Expenses by category', summary.expenseByCategory], ['Top clients', summary.topClients]] as const).map(([title, list]) => (
                <Card key={title}>
                  <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    {list.length === 0 ? <p className="px-6 pb-6 text-sm text-gray-400">None this year</p> : (
                      <ul className="divide-y divide-gray-100">{list.map(c => (
                        <li key={c.name} className="flex items-center gap-3 px-6 py-2.5 text-sm"><span className="flex-1 min-w-0 truncate">{c.name}</span><span className={'tabular-nums font-medium ' + (c.cents < 0 ? 'text-red-600' : '')}>{fmt(c.cents)}</span></li>
                      ))}</ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-xs text-gray-400">{summary.transactions} transactions in {summary.year}. This is a summary of what&apos;s in Bookkeeping, not a tax filing.</p>
          </div>
        ))}

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
        <p className="text-[11px] leading-snug text-gray-400 border-t border-gray-100 pt-3">
          {TAX_DISCLAIMER} {MILEAGE_DISCLAIMER} <a href={IRS_MILEAGE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600 print:no-underline">IRS standard mileage rates</a>.
        </p>
      </div>
    </>
  );
}
