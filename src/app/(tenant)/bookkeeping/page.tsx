'use client';
// Insights → Bookkeeping: income and expenses. Paid invoices, payment-schedule payments and BoothGen processing fees
// come in on their own (Refresh); everything else is added with New Income / New Expense.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { MoreMenu } from '@/components/ui/MoreMenu';
import { fmtCents } from '@/lib/utils';
import { RefreshCw, Plus, BarChart3, Settings2, Paperclip, CheckCircle2, Pencil, Trash2, Receipt, Calendar, RotateCcw, Download, Undo2, Car } from 'lucide-react';
import TransactionModal from './TransactionModal';
import CategoriesModal from './CategoriesModal';
import RefundModal from './RefundModal';
import { MileageSettingsModal, MileageTripModal } from './MileageModals';
import { TAX_DISCLAIMER, IRS_MILEAGE_URL } from '@/lib/bookkeeping/disclaimer';
import { uploadReceipt, SOURCE_LABEL, type Category, type EventOption, type Txn } from './shared';

type Tab = 'all' | 'uncategorized' | 'categorized';
const EMPTY_FILTERS = { source: '', categoryId: '', type: '', from: '', to: '', amount: '', q: '' };
const GRID = 'grid grid-cols-[1.25rem_minmax(0,1fr)_auto_2rem] md:grid-cols-[1.25rem_6rem_minmax(0,1fr)_1.25rem_minmax(6rem,9rem)_6.5rem_2rem] items-center gap-x-3 px-4';

export default function BookkeepingPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [data, setData] = useState<{ rows: Txn[]; income: number; expense: number; uncategorized: number; categories: Category[]; events: EventOption[]; payees: string[] } | null>(null);
  const [currency, setCurrency] = useState('usd');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState<{ type: 'INCOME' | 'EXPENSE'; txn: Txn | null } | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  const [refunding, setRefunding] = useState<Txn | null>(null);
  const [mileageSettings, setMileageSettings] = useState(false);
  const [trip, setTrip] = useState<string | null>(null);
  const receiptFor = useRef<Txn | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fmt = (c: number) => fmtCents(c, currency);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ tab, ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)) });
    const res = await fetch('/api/bookkeeping/transactions?' + qs);
    if (res.ok) setData(await res.json()); else setError((await res.json().catch(() => ({}))).error ?? 'Could not load');
  }, [tab, applied]);

  // First visit: bring in payments, then load
  useEffect(() => {
    fetch('/api/settings/branding').then(r => r.json()).then(b => { if (b?.currency) setCurrency(b.currency); }).catch(() => {});
    fetch('/api/bookkeeping/sync', { method: 'POST' }).finally(() => load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (data) load(); setSelected(new Set()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tab, applied]);

  async function refresh() {
    setBusy('refresh'); setNote(''); setError('');
    const res = await fetch('/api/bookkeeping/sync', { method: 'POST' });
    const r = await res.json().catch(() => ({}));
    if (res.ok) setNote(r.added ? `${r.added} new transaction${r.added === 1 ? '' : 's'} from BoothGen payments.` : 'Up to date.');
    else setError(r.error ?? 'Refresh failed');
    await load(); setBusy('');
  }

  async function bulk(action: string, extra: Record<string, unknown> = {}) {
    if (selected.size === 0) return;
    if (action === 'delete' && !confirm(`Delete ${selected.size} selected transaction${selected.size === 1 ? '' : 's'}? Rows BoothGen filled in (payments, refunds, fees, print logs, event expenses) are kept; change those where they came from.`)) return;
    setBusy(action); setNote(''); setError('');
    const res = await fetch('/api/bookkeeping/transactions/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...selected], action, ...extra }) });
    const r = await res.json().catch(() => ({}));
    if (!res.ok) setError(r.error ?? 'Something went wrong');
    else {
      const parts: string[] = [];
      if (r.skipped) parts.push(`${r.count} updated. ${r.skipped} skipped (${action === 'delete' ? 'filled in by BoothGen' : 'a different kind: income categories only go on income, expense categories on expenses'}).`);
      if (r.alsoCategorized) parts.push(`Also categorized ${r.alsoCategorized} other transaction${r.alsoCategorized === 1 ? '' : 's'} from the same payee${r.alsoCategorized === 1 ? '' : 's'}.`);
      if (parts.length) setNote(parts.join(' '));
    }
    setSelected(new Set()); await load(); setBusy('');
  }

  async function removeOne(t: Txn) {
    if (!confirm('Delete this transaction?')) return;
    const res = await fetch('/api/bookkeeping/transactions/' + t.id, { method: 'DELETE' });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? 'Could not delete');
    await load();
  }

  async function attachReceipt(file: File | undefined) {
    const t = receiptFor.current;
    if (!file || !t) return;
    setBusy('receipt'); setError('');
    try {
      const r = await uploadReceipt(file);
      const res = await fetch('/api/bookkeeping/transactions/' + t.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receiptUrl: r.url, receiptName: r.name }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not save the receipt');
    } catch (e) { setError((e as Error).message); }
    if (fileInput.current) fileInput.current.value = '';
    await load(); setBusy('');
  }

  const rows = data?.rows ?? [];
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const visibleCats = (data?.categories ?? []).filter(c => !c.hidden);
  const exportHref = '/api/bookkeeping/reports?' + new URLSearchParams({ report: 'transactions', format: 'csv', tab, ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)) });

  return (
    <>
      <TopBar title="Bookkeeping" />
      <div className="p-4 sm:p-8 space-y-5">
        {/* Header actions */}
        <div className="flex flex-col xl:flex-row gap-3 xl:items-center xl:justify-between">
          <p className="text-sm text-gray-500 max-w-2xl">Income and expenses. Payments, refunds, BoothGen fees, print costs, event expenses and mileage are added automatically; add anything else with New Income or New Expense.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy === 'refresh'}><RefreshCw className={'w-3.5 h-3.5 mr-1.5 ' + (busy === 'refresh' ? 'animate-spin' : '')} />Refresh</Button>
            <Button variant="outline" size="sm" onClick={() => setModal({ type: 'INCOME', txn: null })}><Plus className="w-3.5 h-3.5 mr-1" />New Income</Button>
            <Button variant="outline" size="sm" onClick={() => setModal({ type: 'EXPENSE', txn: null })}><Plus className="w-3.5 h-3.5 mr-1" />New Expense</Button>
            <Link href="/bookkeeping/reports"><Button variant="outline" size="sm"><BarChart3 className="w-3.5 h-3.5 mr-1.5" />Reports</Button></Link>
            <MoreMenu items={[
              { label: 'Categories', icon: Settings2, onClick: () => setCatsOpen(true) },
              { label: 'Mileage', icon: Car, onClick: () => setMileageSettings(true) },
              { label: 'Export CSV', icon: Download, href: exportHref, external: true },
              { label: 'Export for QuickBooks', icon: Download, href: exportHref + '&layout=quickbooks', external: true },
              { label: 'Export for Xero', icon: Download, href: exportHref + '&layout=xero', external: true },
            ]} />
          </div>
        </div>

        {/* Totals for what's shown */}
        <div className="grid grid-cols-3 gap-3">
          {[['Income', data?.income ?? 0, 'text-green-600'], ['Expenses', data?.expense ?? 0, 'text-red-600'], ['Net', (data?.income ?? 0) - (data?.expense ?? 0), 'text-[#1F1F3D]']].map(([label, cents, cls]) => (
            <Card key={label as string}><CardContent className="pt-4 pb-4"><p className="text-xs uppercase tracking-wide text-gray-400">{label as string}</p><p className={'text-lg sm:text-2xl font-bold ' + cls}>{fmt(cents as number)}</p></CardContent></Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap border-b border-gray-200">
          {([['all', 'All Transactions'], ['uncategorized', 'To Be Categorized'], ['categorized', 'Categorized']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px flex items-center gap-1.5 ' + (tab === t ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>
              {label}{t === 'uncategorized' && <span className={'min-w-[18px] text-center text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ' + ((data?.uncategorized ?? 0) > 0 ? 'bg-[#F97316] text-white' : 'bg-gray-100 text-gray-500')}>{data?.uncategorized ?? 0}</span>}
            </button>
          ))}
        </div>

        {/* Filters */}
        <form onSubmit={e => { e.preventDefault(); setApplied(filters); }} className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          <Select value={filters.source} onChange={e => setFilters(f => ({ ...f, source: e.target.value }))} aria-label="Source"><option value="">All sources</option><option value="auto">From BoothGen (payments, fees, refunds, print logs, event expenses)</option><option value="manual">Added by hand</option></Select>
          <Select value={filters.categoryId} onChange={e => setFilters(f => ({ ...f, categoryId: e.target.value }))} aria-label="Category"><option value="">All categories</option>{(data?.categories ?? []).map(c => <option key={c.id} value={c.id}>{c.name}{c.hidden ? ' (hidden)' : ''}</option>)}</Select>
          <Select value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))} aria-label="Type"><option value="">All types</option><option value="INCOME">Income</option><option value="EXPENSE">Expenses</option></Select>
          <Input type="date" aria-label="From" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
          <Input type="date" aria-label="To" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
          <Input inputMode="decimal" placeholder="Amount" value={filters.amount} onChange={e => setFilters(f => ({ ...f, amount: e.target.value }))} />
          <Input placeholder="Keywords" value={filters.q} onChange={e => setFilters(f => ({ ...f, q: e.target.value }))} />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1">Search</Button>
            <Button type="button" variant="outline" aria-label="Clear filters" onClick={() => { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); }}><RotateCcw className="w-4 h-4" /></Button>
          </div>
        </form>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#0085FF]/30 bg-[#0085FF]/5 px-3 py-2">
            <span className="text-sm font-medium text-[#1F1F3D] mr-1">{selected.size} selected</span>
            <Select className="h-8 w-auto text-xs" value="" onChange={e => { if (e.target.value) bulk('categorize', { categoryId: e.target.value === '-' ? null : e.target.value }); }} aria-label="Categorize">
              <option value="">Categorize…</option>
              <optgroup label="Income">{visibleCats.filter(c => c.type === 'INCOME').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
              <optgroup label="Expenses">{visibleCats.filter(c => c.type === 'EXPENSE').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
              <option value="-">Remove category</option>
            </Select>
            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => bulk('verify')} disabled={!!busy}><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Verify</Button>
            <Select className="h-8 w-auto max-w-[14rem] text-xs" value="" onChange={e => { if (e.target.value) bulk('assign', { eventId: e.target.value === '-' ? null : e.target.value }); }} aria-label="Assign to event">
              <option value="">Assign to event…</option>
              {(data?.events ?? []).map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              <option value="-">Remove from event</option>
            </Select>
            <Button size="sm" variant="destructive" onClick={() => bulk('delete')} disabled={!!busy}><Trash2 className="w-3.5 h-3.5 mr-1" />Delete</Button>
            <button className="ml-auto text-xs text-gray-500 hover:text-gray-800" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}
        {note && <p className="text-sm text-gray-600">{note}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Transactions */}
        <Card><CardContent className="p-0">
          <div className={GRID + ' py-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 border-b border-gray-100'}>
            <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)))} />
            <span className="hidden md:block">Date</span><span>Description</span><span className="hidden md:block" title="Receipt"><Paperclip className="w-3.5 h-3.5" /></span><span className="hidden md:block">Category</span><span className="text-right">Amount</span><span />
          </div>
          {!data ? (
            <p className="px-4 py-10 text-center text-sm text-gray-400">Loading…</p>
          ) : rows.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-400">
              <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
              {tab === 'uncategorized' ? 'Everything is categorized.' : 'No transactions here yet. Payments on your invoices show up automatically; add other income and expenses with the buttons above.'}
            </div>
          ) : rows.map(t => (
            <div key={t.id} className={GRID + ' py-3 text-sm border-b border-gray-100 last:border-0 ' + (selected.has(t.id) ? 'bg-amber-50/60' : 'hover:bg-gray-50')}>
              <input type="checkbox" aria-label="Select" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
              <span className="hidden md:block text-gray-600">{format(new Date(t.date), 'MMM d, yyyy')}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="break-words text-[#1F1F3D]">{t.description}</span>
                  {t.verified && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-green-600" aria-label="Verified" />}
                </span>
                <span className="block text-xs text-gray-400 truncate">
                  <span className="md:hidden">{format(new Date(t.date), 'MMM d, yyyy')} · {t.category?.name ?? 'To be categorized'} · </span>
                  {[SOURCE_LABEL[t.source] ?? t.source, t.event?.title].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="hidden md:block">{t.receiptUrl && <a href={t.receiptUrl} target="_blank" rel="noopener noreferrer" title={t.receiptName ?? 'Receipt'} className="text-gray-500 hover:text-[#0085FF]"><Paperclip className="w-4 h-4" /></a>}</span>
              <span className={'hidden md:block truncate ' + (t.category ? 'text-gray-700' : 'text-amber-600')}>{t.category?.name ?? 'To be categorized'}</span>
              <span className={'text-right font-semibold tabular-nums ' + (t.type === 'INCOME' && t.amountCents > 0 ? 'text-green-600' : 'text-red-600')}>{t.type === 'EXPENSE' ? '-' : ''}{fmt(t.amountCents)}</span>
              <MoreMenu items={[
                t.invoice && { label: 'View Invoice ' + t.invoice.invoiceNumber, icon: Receipt, href: '/invoices/' + t.invoice.id },
                t.event && { label: 'View Event', icon: Calendar, href: '/events/' + t.event.id },
                t.receiptUrl && { label: 'View Receipt', icon: Paperclip, href: t.receiptUrl, external: true },
                { label: t.receiptUrl ? 'Replace Receipt' : 'Add Receipt', icon: Paperclip, onClick: () => { receiptFor.current = t; fileInput.current?.click(); } },
                { label: t.verified ? 'Mark Unverified' : 'Verify', icon: CheckCircle2, onClick: async () => { await fetch('/api/bookkeeping/transactions/' + t.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ verified: !t.verified }) }); load(); } },
                t.type === 'INCOME' && t.amountCents > 0 && { label: 'Record Refund', icon: Undo2, onClick: () => setRefunding(t) },
                t.source === 'mileage' && t.eventId && { label: 'Edit Mileage', icon: Car, onClick: () => setTrip(t.eventId) },
                { label: 'Edit', icon: Pencil, onClick: () => setModal({ type: t.type, txn: t }) },
                t.source === 'manual' && 'divider',
                t.source === 'manual' && { label: 'Delete', icon: Trash2, danger: true, onClick: () => removeOne(t) },
              ]} />
            </div>
          ))}
        </CardContent></Card>
        {rows.length >= 1000 && <p className="text-xs text-gray-400">Showing the latest 1,000. Narrow the dates to see older ones.</p>}
        <p className="text-[11px] leading-snug text-gray-400">{TAX_DISCLAIMER} Mileage uses the IRS rate BoothGen has on file; confirm the current rate at <a href={IRS_MILEAGE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">irs.gov</a>.</p>
      </div>

      <input ref={fileInput} type="file" accept="image/*,application/pdf" className="sr-only" onChange={e => attachReceipt(e.target.files?.[0])} />
      {modal && data && (
        <TransactionModal open type={modal.type} txn={modal.txn} categories={data.categories} events={data.events} payees={data.payees} onClose={() => setModal(null)} onSaved={msg => { setModal(null); setNote(msg ?? ''); load(); }} />
      )}
      {catsOpen && <CategoriesModal open onClose={() => { setCatsOpen(false); load(); }} />}
      {mileageSettings && <MileageSettingsModal onClose={() => { setMileageSettings(false); load(); }} />}
      {trip && <MileageTripModal eventId={trip} fmt={fmt} onClose={() => { setTrip(null); load(); }} onSaved={() => load()} />}
      {refunding && <RefundModal txn={refunding} fmt={fmt} onClose={() => setRefunding(null)} onSaved={() => { setRefunding(null); load(); }} />}
    </>
  );
}
