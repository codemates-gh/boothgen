'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

// Genie-only account → Genius Pro checkout. Subscribing brings the CRM back (src/lib/genius.ts).
export function SubscribeProButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function go() {
    setBusy(true); setError('');
    const r = await fetch('/api/stripe/billing/checkout', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (r.ok && d.url) { window.location.href = d.url; return; }
    setBusy(false);
    setError(d.error || 'Could not start checkout');
  }
  return (
    <div>
      <Button onClick={go} disabled={busy}>{busy ? 'Opening…' : 'Subscribe to Genius Pro'}</Button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}
