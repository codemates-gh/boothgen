'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';

export default function PlatformSettings({ initial }: { initial: { message_retention_months: string } }) {
  const [months, setMonths] = useState(initial.message_retention_months);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch('/api/super-admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_retention_months: months }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings className="w-4 h-4" /> Platform Settings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 max-w-sm">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lead message retention (months)
            </label>
            <p className="text-xs text-gray-400 mb-2">Messages older than this are purged nightly</p>
            <input
              type="number"
              min={1}
              max={120}
              value={months}
              onChange={e => setMonths(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div className="pt-8">
            <Button onClick={save} disabled={saving} size="sm">
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
