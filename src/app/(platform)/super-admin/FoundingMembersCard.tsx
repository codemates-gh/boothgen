'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, CheckCircle, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';

type Member = {
  id: string;
  paymentEmail: string;
  name: string | null;
  company: string | null;
  tier: number;
  amountCents: number;
  status: string;
  createdAt: string;
};

type Settings = {
  founding_enabled?: string;
  founding_round?: string;
  founding_spots_limit?: string;
};

const STATUS_BADGE: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  PAID: 'success',
  SETUP_COMPLETE: 'success',
  PENDING: 'warning',
  REFUNDED: 'danger',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  PAID:           <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  SETUP_COMPLETE: <CheckCircle className="w-3.5 h-3.5 text-green-600" />,
  PENDING:        <Clock className="w-3.5 h-3.5 text-yellow-500" />,
  REFUNDED:       <XCircle className="w-3.5 h-3.5 text-red-400" />,
};

export default function FoundingMembersCard({
  initialSettings,
  initialMembers,
}: {
  initialSettings: Settings;
  initialMembers: Member[];
}) {
  const [enabled,    setEnabled]    = useState(initialSettings.founding_enabled !== 'false');
  const [round,      setRound]      = useState(initialSettings.founding_round ?? '1');
  const [spotLimit,  setSpotLimit]  = useState(initialSettings.founding_spots_limit ?? '5');
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [members]                   = useState<Member[]>(initialMembers);

  const r1 = members.filter(m => m.tier === 1 && (m.status === 'PAID' || m.status === 'SETUP_COMPLETE')).length;
  const r2 = members.filter(m => m.tier === 2 && (m.status === 'PAID' || m.status === 'SETUP_COMPLETE')).length;
  const r3 = members.filter(m => m.tier === 3 && (m.status === 'PAID' || m.status === 'SETUP_COMPLETE')).length;
  const total = r1 + r2 + r3;

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch('/api/super-admin/founding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        founding_enabled:      enabled ? 'true' : 'false',
        founding_round:        round,
        founding_spots_limit:  spotLimit,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="w-4 h-4 text-orange-500 fill-orange-400" /> Founding Member Promotion
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {([['Total claimed', total, 'text-brand'], ['Round 1', r1, 'text-green-600'], ['Round 2', r2, 'text-yellow-600'], ['Round 3', r3, 'text-orange-600']] as const).map(([label, val, color]) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
              <p className={`text-2xl font-bold ${color}`}>{val}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Offer status</label>
            <div className="flex items-center gap-3 h-10">
              <button
                onClick={() => setEnabled(!enabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm text-gray-600">{enabled ? 'Open' : 'Paused'}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current round</label>
            <select
              value={round}
              onChange={e => setRound(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="1">Round 1 — $300</option>
              <option value="2">Round 2 — $400</option>
              <option value="3">Round 3 — $500</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Spots available</label>
            <p className="text-xs text-gray-400 mb-1">How many you&apos;re opening right now</p>
            <input
              type="number" min={0} max={100}
              value={spotLimit}
              onChange={e => setSpotLimit(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>

        <div>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Settings'}
          </Button>
          <p className="text-xs text-gray-400 mt-2">
            Landing page: <a href="/lifetime" target="_blank" className="text-brand underline">/lifetime</a>
          </p>
        </div>

        {/* Member list */}
        {members.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-3">Founding Members ({members.length})</p>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Name / Email</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Company</th>
                    <th className="text-center px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Round</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Paid</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 uppercase">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map(m => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{m.name ?? '—'}</p>
                        <p className="text-xs text-gray-400">{m.paymentEmail}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{m.company ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">R{m.tier}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">${m.amountCents / 100}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {STATUS_ICON[m.status]}
                          <Badge variant={STATUS_BADGE[m.status] ?? 'default'} className="text-xs">{m.status.replace('_', ' ')}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {format(new Date(m.createdAt), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {members.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No founding members yet. Share the link to start.</p>
        )}
      </CardContent>
    </Card>
  );
}
