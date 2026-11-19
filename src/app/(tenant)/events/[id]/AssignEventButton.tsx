'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserCheck, Loader2 } from 'lucide-react';

interface Member { id: string; name: string; email: string; }

// Assigned To, and the pay for that person (saved as the event's Operator Pay expense)
export default function AssignEventButton({
  eventId,
  currentAssigneeId,
  members,
  currentPayCents = null,
  currency = 'usd',
}: {
  eventId: string;
  currentAssigneeId: string | null;
  members: Member[];
  currentPayCents?: number | null;
  currency?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [value, setValue] = useState(currentAssigneeId ?? '');
  const toInput = (c: number | null) => (c ? (c / 100).toFixed(2).replace(/\.00$/, '') : '');
  const [pay, setPay] = useState(toInput(currentPayCents));
  const symbol = (() => { try { return (0).toLocaleString('en-US', { style: 'currency', currency }).replace(/[\d.,\s]/g, ''); } catch { return '$'; } })();

  async function save(body: { userId: string | null; payCents?: number | null }) {
    setSaving(true); setError('');
    const r = await fetch(`/api/events/${eventId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Could not save'); return; }
    router.refresh();
  }

  function onAssignee(userId: string) {
    setValue(userId);
    if (!userId) setPay('');
    save({ userId: userId || null });
  }

  function onPayBlur() {
    const n = pay.trim() === '' ? 0 : Number(pay.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || n < 0) { setError('Enter the pay as an amount'); return; }
    const cents = Math.round(n * 100);
    if (cents === (currentPayCents ?? 0)) return;
    save({ userId: value || null, payCents: cents || null });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 min-w-0">
        <UserCheck className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <select
          value={value}
          onChange={e => onAssignee(e.target.value)}
          disabled={saving}
          className="min-w-0 flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white disabled:opacity-50 truncate"
        >
          <option value="">Unassigned</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-400 flex-shrink-0" />}
      </div>
      {value && (
        <label className="flex items-center gap-2 pl-6">
          <span className="text-xs text-gray-500 w-8">Pay</span>
          <span className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{symbol}</span>
            <input
              inputMode="decimal"
              value={pay}
              onChange={e => setPay(e.target.value)}
              onBlur={onPayBlur}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              disabled={saving}
              placeholder="0"
              className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white disabled:opacity-50"
            />
          </span>
        </label>
      )}
      {error && <p className="text-xs text-red-600 pl-6">{error}</p>}
    </div>
  );
}
