'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export function CancelAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleCancel() {
    setLoading(true);
    setError('');
    const res = await fetch('/api/settings/cancel', { method: 'POST' });
    if (res.ok) {
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? 'Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  if (!confirming) {
    return (
      <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50" onClick={() => setConfirming(true)}>
        Cancel Account
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
      <p className="text-sm font-medium text-red-800">Are you sure you want to cancel?</p>
      <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
        <li>Your Stripe subscription will be cancelled at the end of the current billing period</li>
        <li>You'll keep full access for 30 days to export your data</li>
        <li>After 30 days, all data is permanently deleted</li>
      </ul>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3">
        <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={loading}>
          Keep My Account
        </Button>
        <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={handleCancel} disabled={loading}>
          {loading ? 'Cancelling…' : 'Yes, Cancel Account'}
        </Button>
      </div>
    </div>
  );
}
