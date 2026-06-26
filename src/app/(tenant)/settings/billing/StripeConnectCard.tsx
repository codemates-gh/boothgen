'use client';
import { useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2, ShieldCheck, Zap, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  status: 'active' | 'incomplete' | 'none';
  chargesEnabled: boolean;
}

export function StripeConnectCard({ status, chargesEnabled }: Props) {
  const [redirecting, setRedirecting] = useState(false);

  function handleConnect() {
    setRedirecting(true);
    window.location.href = '/api/stripe/connect/authorize';
  }

  return (
    <div className="space-y-4">
      {/* Status badge */}
      {status === 'active' ? (
        <div className="flex items-center gap-3 text-green-700 bg-green-50 rounded-xl p-4">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Connected</p>
            <p className="text-sm">Charges: {chargesEnabled ? 'Enabled' : 'Pending'}</p>
          </div>
        </div>
      ) : status === 'incomplete' ? (
        <div className="flex items-center gap-3 text-yellow-700 bg-yellow-50 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Onboarding Incomplete</p>
            <p className="text-sm">Finish your Stripe account setup to accept payments.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Booth Genius uses <strong>Stripe Connect</strong> to process client payments. When your clients pay an invoice online, the money goes directly to your Stripe account — Booth Genius never holds your funds.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="flex items-start gap-2 bg-gray-50 rounded-lg p-3">
              <DollarSign className="w-4 h-4 text-brand mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-700">Direct Deposits</p>
                <p className="text-xs text-gray-500 mt-0.5">Funds land in your bank account within 2 business days.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-gray-50 rounded-lg p-3">
              <ShieldCheck className="w-4 h-4 text-brand mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-700">Secure & Trusted</p>
                <p className="text-xs text-gray-500 mt-0.5">Stripe powers payments for millions of businesses worldwide.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-gray-50 rounded-lg p-3">
              <Zap className="w-4 h-4 text-brand mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gray-700">5-Minute Setup</p>
                <p className="text-xs text-gray-500 mt-0.5">Use an existing Stripe account or create a free one during setup.</p>
              </div>
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800 leading-relaxed">
            <strong>Already have a Stripe account?</strong> No need to create a new one — just log in during the setup flow and Stripe will link your existing account to Booth Genius. This is separate from any Booth Genius subscription payment; it's what routes your <em>clients'</em> payments directly to your bank.
          </div>
          <p className="text-xs text-gray-400">
            Clicking the button below will redirect you to Stripe's secure onboarding flow. You'll be returned here once setup is complete. Required to send quotes and accept payments.
          </p>
        </div>
      )}

      {/* Action button */}
      <Button
        variant={status === 'active' ? 'outline' : 'default'}
        onClick={handleConnect}
        disabled={redirecting}
      >
        {redirecting
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redirecting to Stripe…</>
          : status === 'active' ? 'Update Stripe'
          : status === 'incomplete' ? 'Complete Stripe Setup'
          : 'Connect Stripe Account'}
      </Button>
    </div>
  );
}
