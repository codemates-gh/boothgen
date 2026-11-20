'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const PAYOUTS_NOTE = "Card payments show here as soon as they're paid. Stripe sends the money to your bank, usually within 2 business days. Check payouts, disputes and Stripe's fees in Stripe.";

// "View payouts in Stripe" (opens the operator's Stripe in a new tab) with the note on where money shows. Shown only
// when Stripe is connected with charges enabled; otherwise the usual Connect Stripe prompt. `connected` skips the
// lookup when the page already knows (Settings → Billing).
export function StripePayoutsLink({ connected: known, note = true }: { connected?: boolean; note?: boolean }) {
  const [connected, setConnected] = useState<boolean | null>(known ?? null);
  useEffect(() => {
    if (known !== undefined) return;
    fetch('/api/stripe/connect/status').then(r => r.ok ? r.json() : null).then(d => setConnected(!!d?.connected)).catch(() => setConnected(false));
  }, [known]);
  if (connected === null) return null;
  if (!connected) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>Connect Stripe to take card payments online.</span>
        <Link href="/settings/billing"><Button variant="outline" size="sm">Connect Stripe</Button></Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <a href="/api/stripe/connect/dashboard" target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm"><ExternalLink className="w-3.5 h-3.5 mr-1" />View payouts in Stripe</Button>
      </a>
      {note && <p className="text-xs text-gray-500 max-w-xl">{PAYOUTS_NOTE}</p>}
    </div>
  );
}
