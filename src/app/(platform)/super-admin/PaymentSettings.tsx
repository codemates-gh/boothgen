'use client';
import { useState } from 'react';
import { CreditCard, Percent, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface InitialPaymentSettings {
  stripe_price_monthly_id: string;
  price_display_monthly: string;
  commission_percentage: string;
}

export default function PaymentSettings({ initial }: { initial: InitialPaymentSettings }) {
  const [monthlyPriceId, setMonthlyPriceId]   = useState(initial.stripe_price_monthly_id);
  const [monthlyDisplay, setMonthlyDisplay]   = useState(initial.price_display_monthly);
  const [commissionPct, setCommissionPct]     = useState(initial.commission_percentage);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch('/api/super-admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stripe_price_monthly_id: monthlyPriceId,
        price_display_monthly:   monthlyDisplay,
        commission_percentage:   commissionPct,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="w-4 h-4" /> Stripe Billing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Stripe Price IDs for platform subscriptions. Find these in your Stripe Dashboard under Products.
          </p>
          <div className="max-w-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1">Pro Monthly Price ID</label>
            <p className="text-xs text-gray-400 mb-2">e.g. price_1ABC… (from Stripe Dashboard → Products)</p>
            <input
              type="text"
              value={monthlyPriceId}
              onChange={e => setMonthlyPriceId(e.target.value)}
              placeholder="price_..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="w-4 h-4" /> Display Pricing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            The prices shown on the public <strong>/pricing</strong> page. These are display-only — actual charges are
            controlled by the Stripe Price IDs above.
          </p>
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">Pro Monthly Display Price</label>
            <p className="text-xs text-gray-400 mb-2">Number only, e.g. 25 (shown as $25/mo)</p>
            <input
              type="number" min={0} step={1}
              value={monthlyDisplay}
              onChange={e => setMonthlyDisplay(e.target.value)}
              placeholder="25"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="w-4 h-4" /> Platform Commission
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Platform fee taken from each booking processed through Stripe Connect. This is also displayed
            on the marketing and pricing pages.
          </p>
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">Commission %</label>
            <p className="text-xs text-gray-400 mb-2">e.g. 5 = 5% of each booking</p>
            <input
              type="number" min={0} max={100} step={0.1}
              value={commissionPct}
              onChange={e => setCommissionPct(e.target.value)}
              placeholder="5"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </CardContent>
      </Card>

      <div>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Payment Settings'}
        </Button>
      </div>
    </div>
  );
}
