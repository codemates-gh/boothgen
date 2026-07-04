'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Zap } from 'lucide-react';

export function UpgradeButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleUpgrade() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/stripe/billing/checkout', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error ?? 'Something went wrong. Please try again.'); setLoading(false); return; }
      window.location.href = data.url;
    } catch {
      setError('Could not reach the server. Please check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleUpgrade} disabled={loading} className="flex items-center gap-2">
        <Zap className="w-4 h-4" />
        {loading ? 'Redirecting…' : 'Upgrade to Pro'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
