'use client';
import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Loader2, Lock } from 'lucide-react';

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''
);

const fmt = (c: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'usd' }).format(c / 100);

function Checkout({
  amountCents,
  brandColor,
  returnUrl,
}: {
  amountCents: number;
  brandColor: string;
  returnUrl: string;
}) {
  const stripe     = useStripe();
  const elements   = useElements();
  const [err, setErr]           = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    if (error) {
      setErr(error.message ?? 'Payment failed. Please try again.');
      setBusy(false);
    }
    // Success → Stripe redirects to returnUrl automatically
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {err && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {err}
        </p>
      )}
      <button
        type="submit"
        disabled={!stripe || busy}
        className="w-full py-3 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-opacity disabled:opacity-60"
        style={{ backgroundColor: brandColor }}
      >
        {busy
          ? <><Loader2 className="w-4 h-4 animate-spin" />Processing…</>
          : <><Lock className="w-4 h-4" />Pay {fmt(amountCents)}</>}
      </button>
      <p className="text-xs text-center text-gray-400 flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" /> Secured by Stripe
      </p>
    </form>
  );
}

export function InvoicePaymentForm({
  invoiceId,
  milestoneId,
  amountCents,
  brandColor,
  returnUrl,
}: {
  invoiceId:   string;
  milestoneId?: string;
  amountCents: number;
  brandColor:  string;
  returnUrl:   string;
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [fetchErr,     setFetchErr]     = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/public/stripe/payment-intent', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ invoiceId, milestoneId }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) setFetchErr(d.error);
        else         setClientSecret(d.clientSecret);
      })
      .catch(() => setFetchErr('Could not initialise payment form.'));
  }, [invoiceId, milestoneId]);

  if (fetchErr) return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 text-center">
      {fetchErr}
    </div>
  );

  if (!clientSecret) return (
    <div className="flex justify-center py-8">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  );

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: { colorPrimary: brandColor },
        },
      }}
    >
      <Checkout
        amountCents={amountCents}
        brandColor={brandColor}
        returnUrl={returnUrl}
      />
    </Elements>
  );
}
