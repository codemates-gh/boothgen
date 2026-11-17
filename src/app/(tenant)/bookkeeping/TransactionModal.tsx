'use client';
// New Income / New Expense / Edit a transaction. Rows BoothGen filled in from payments only let you change the
// category, event, notes and receipt (the amount and date come from the invoice).
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Paperclip, X } from 'lucide-react';
import { uploadReceipt, SOURCE_NOTE, type Category, type EventOption, type Txn } from './shared';

export default function TransactionModal({ open, type, txn, categories, events, onClose, onSaved }: {
  open: boolean;
  type: 'INCOME' | 'EXPENSE';
  txn: Txn | null; // null = new
  categories: Category[];
  events: EventOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const auto = !!txn && txn.source !== 'manual';
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState(() => ({
    date: txn ? txn.date.slice(0, 10) : today,
    amount: txn ? (Math.abs(txn.amountCents) / 100).toFixed(2) : '',
    description: txn?.description ?? '',
    payee: txn?.payee ?? '',
    categoryId: txn?.categoryId ?? '',
    eventId: txn?.eventId ?? '',
    notes: txn?.notes ?? '',
    receiptUrl: txn?.receiptUrl ?? '',
    receiptName: txn?.receiptName ?? '',
  }));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const kind = txn?.type ?? type;
  const cats = categories.filter(c => c.type === kind && (!c.hidden || c.id === form.categoryId));

  async function attach(file: File | undefined) {
    if (!file) return;
    setUploading(true); setError('');
    try {
      const r = await uploadReceipt(file);
      setForm(f => ({ ...f, receiptUrl: r.url, receiptName: r.name }));
    } catch (e) { setError((e as Error).message); }
    setUploading(false);
  }

  async function save() {
    setError('');
    const cents = Math.round(parseFloat(form.amount.replace(/[$,]/g, '')) * 100);
    if (!auto) {
      if (!form.description.trim()) { setError('Add a description'); return; }
      if (!Number.isFinite(cents) || cents <= 0) { setError('Enter an amount'); return; }
    }
    setSaving(true);
    const common = { categoryId: form.categoryId || null, eventId: form.eventId || null, notes: form.notes || null, receiptUrl: form.receiptUrl || null, receiptName: form.receiptName || null };
    const body = auto ? common : { ...common, date: form.date, amountCents: cents, description: form.description.trim(), payee: form.payee.trim() || null };
    const res = txn
      ? await fetch('/api/bookkeeping/transactions/' + txn.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch('/api/bookkeeping/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, type }) });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not save'); return; }
    onSaved();
  }

  const title = txn ? (auto ? 'Edit Transaction' : kind === 'INCOME' ? 'Edit Income' : 'Edit Expense') : (type === 'INCOME' ? 'New Income' : 'New Expense');
  const label = 'block text-sm font-medium text-gray-700 mb-1';
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        {auto ? (
          <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
            <p className="font-medium text-[#1F1F3D]">{txn!.description}</p>
            <p className="text-xs text-gray-500 mt-0.5">{SOURCE_NOTE[txn!.source] ?? 'Filled in by BoothGen.'}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={label}>Date</label><Input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
              <div><label className={label}>Amount</label><Input inputMode="decimal" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>
            </div>
            <div><label className={label}>Description</label><Input value={form.description} onChange={e => set('description', e.target.value)} placeholder={type === 'INCOME' ? 'e.g. Cash tip at the Rivera wedding' : 'e.g. DNP print media, 2 rolls'} /></div>
            <div><label className={label}>{kind === 'INCOME' ? 'Received from' : 'Paid to'} <span className="font-normal text-gray-400">(optional)</span></label><Input value={form.payee} onChange={e => set('payee', e.target.value)} /></div>
          </>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={label}>Category</label>
            <Select value={form.categoryId} onChange={e => set('categoryId', e.target.value)}>
              <option value="">To be categorized</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <div>
            <label className={label}>Event <span className="font-normal text-gray-400">(optional)</span></label>
            <Select value={form.eventId} onChange={e => set('eventId', e.target.value)}>
              <option value="">No event</option>
              {events.map(ev => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </Select>
          </div>
        </div>
        <div><label className={label}>Notes <span className="font-normal text-gray-400">(optional)</span></label><Textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
        <div>
          <label className={label}>Receipt <span className="font-normal text-gray-400">(photo or PDF, up to 25 MB)</span></label>
          {form.receiptUrl ? (
            <div className="flex items-center gap-2 text-sm">
              <a href={form.receiptUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[#0085FF] hover:underline min-w-0"><Paperclip className="w-4 h-4 flex-shrink-0" /><span className="truncate">{form.receiptName || 'Receipt'}</span></a>
              <button type="button" onClick={() => setForm(f => ({ ...f, receiptUrl: '', receiptName: '' }))} className="text-gray-400 hover:text-red-500" aria-label="Remove receipt"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <Paperclip className="w-4 h-4" />{uploading ? 'Uploading…' : 'Attach receipt'}
              <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" disabled={uploading} onChange={e => attach(e.target.files?.[0])} />
            </label>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || uploading}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}
