'use client';
// Record a refund given outside Stripe (cash, check, Zelle, Venmo…) against a payment. Stripe refunds come in by
// themselves; this is for everything else.
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Txn } from './shared';

const METHODS = ['Cash', 'Check', 'Zelle', 'Venmo', 'Bank Transfer', 'Card (outside Stripe)', 'Other'];

export default function RefundModal({ txn, fmt, onClose, onSaved }: { txn: Txn; fmt: (c: number) => string; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState((txn.amountCents / 100).toFixed(2));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('Cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    const cents = Math.round(parseFloat(amount.replace(/[$,]/g, '')) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { setError('Enter an amount'); return; }
    setSaving(true); setError('');
    const res = await fetch(`/api/bookkeeping/transactions/${txn.id}/refund`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountCents: cents, date, method }) });
    setSaving(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not save'); return; }
    onSaved();
  }

  const label = 'block text-sm font-medium text-gray-700 mb-1';
  return (
    <Modal open onClose={onClose} title="Record Refund">
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm">
          <p className="font-medium text-[#1F1F3D]">{txn.description}</p>
          <p className="text-xs text-gray-500 mt-0.5">Payment of {fmt(txn.amountCents)}. For a refund given outside Stripe; refunds made in Stripe are added on their own.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={label}>Amount refunded</label><Input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><label className={label}>Date</label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
        </div>
        <div>
          <label className={label}>Refunded by</label>
          <Select value={method} onChange={e => setMethod(e.target.value)}>{METHODS.map(m => <option key={m}>{m}</option>)}</Select>
        </div>
        <p className="text-xs text-gray-500">This records the refund in Bookkeeping only. It doesn&apos;t change the invoice or send money.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Record Refund'}</Button>
        </div>
      </div>
    </Modal>
  );
}
