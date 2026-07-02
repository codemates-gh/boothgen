'use client';
import { useState } from 'react';
import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function EarlyAdopterCard({
  initialCap,
  proSubscriberCount,
}: {
  initialCap: string;
  proSubscriberCount: number;
}) {
  const [earlyAdopterCap, setEarlyAdopterCap] = useState(initialCap);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const cap = parseInt(earlyAdopterCap) || 50;
  const spotsRemaining = Math.max(0, cap - proSubscriberCount);
  const capFull = proSubscriberCount >= cap;

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch('/api/super-admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ early_adopter_cap: earlyAdopterCap }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-4 h-4" /> Early Adopter Cap
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-500">
          Limit introductory Pro plan signups. When the cap is reached, the pricing page shows
          &ldquo;All spots claimed&rdquo; and new subscribers cannot sign up at the introductory rate.
        </p>
        <div className="flex items-start gap-6 flex-wrap">
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">Spot limit</label>
            <p className="text-xs text-gray-400 mb-2">Set to 0 to disable the cap entirely</p>
            <input
              type="number" min={0} max={10000} step={1}
              value={earlyAdopterCap}
              onChange={e => setEarlyAdopterCap(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div className="flex-1 min-w-48">
            <p className="text-sm font-medium text-gray-700 mb-3">Current status</p>
            <div className={`rounded-xl p-4 border ${capFull ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <p className={`text-2xl font-bold ${capFull ? 'text-red-600' : 'text-green-600'}`}>
                {proSubscriberCount} <span className="text-base font-normal">of {cap}</span>
              </p>
              <p className={`text-sm mt-1 ${capFull ? 'text-red-500' : 'text-green-600'}`}>
                {capFull ? 'Cap reached — new Pro signups are blocked' : `${spotsRemaining} spot${spotsRemaining !== 1 ? 's' : ''} remaining`}
              </p>
            </div>
            {cap > 0 && (
              <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${capFull ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(100, (proSubscriberCount / cap) * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
        <div>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
