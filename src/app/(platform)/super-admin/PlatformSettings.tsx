'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Image, CreditCard, Mail } from 'lucide-react';

interface InitialSettings {
  message_retention_months: string;
  gallery_expire_days: string;
  gallery_delete_days: string;
  stripe_price_monthly_id: string;
  stripe_price_annual_id: string;
  price_display_monthly: string;
  price_display_annual: string;
  commission_percentage: string;
  support_email: string;
}

export default function PlatformSettings({ initial }: { initial: InitialSettings }) {
  const [months, setMonths]   = useState(initial.message_retention_months);
  const [expireDays, setExpireDays] = useState(initial.gallery_expire_days);
  const [deleteDays, setDeleteDays] = useState(initial.gallery_delete_days);
  const [monthlyPriceId, setMonthlyPriceId] = useState(initial.stripe_price_monthly_id);
  const [annualPriceId, setAnnualPriceId]   = useState(initial.stripe_price_annual_id);
  const [monthlyDisplay, setMonthlyDisplay] = useState(initial.price_display_monthly);
  const [annualDisplay, setAnnualDisplay]   = useState(initial.price_display_annual);
  const [commissionPct, setCommissionPct]   = useState(initial.commission_percentage);
  const [supportEmail, setSupportEmail]     = useState(initial.support_email);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch('/api/super-admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_retention_months: months,
        gallery_expire_days: expireDays,
        gallery_delete_days: deleteDays,
        stripe_price_monthly_id: monthlyPriceId,
        stripe_price_annual_id: annualPriceId,
        price_display_monthly: monthlyDisplay,
        price_display_annual: annualDisplay,
        commission_percentage: commissionPct,
        support_email: supportEmail,
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
                type="number" min={1} max={120} value={months}
                onChange={e => setMonths(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Image className="w-4 h-4" /> Gallery Retention
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-gray-500">
            Galleries are automatically expired and then permanently deleted based on the event date.
            The nightly job runs at 4 AM UTC.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Days until expiry
              </label>
              <p className="text-xs text-gray-400 mb-2">
                After this many days past the event date, the gallery is hidden from the client portal.
              </p>
              <input
                type="number" min={1} max={3650} value={expireDays}
                onChange={e => setExpireDays(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional days until deletion
              </label>
              <p className="text-xs text-gray-400 mb-2">
                After expiry, photos are kept for this many more days before being permanently deleted from storage.
              </p>
              <input
                type="number" min={1} max={3650} value={deleteDays}
                onChange={e => setDeleteDays(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl text-sm text-gray-600 max-w-lg">
            <p className="font-medium text-gray-800 mb-1">Current schedule</p>
            <p>Galleries expire <strong>{expireDays} days</strong> after the event date.</p>
            <p>Photos are permanently deleted <strong>{parseInt(expireDays) + parseInt(deleteDays || '0')} days</strong> after the event date ({deleteDays} days after expiry).</p>
          </div>
        </CardContent>
      </Card>

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Price ID</label>
              <p className="text-xs text-gray-400 mb-2">e.g. price_1ABC…</p>
              <input
                type="text"
                value={monthlyPriceId}
                onChange={e => setMonthlyPriceId(e.target.value)}
                placeholder="price_..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Annual Price ID</label>
              <p className="text-xs text-gray-400 mb-2">e.g. price_1XYZ…</p>
              <input
                type="text"
                value={annualPriceId}
                onChange={e => setAnnualPriceId(e.target.value)}
                placeholder="price_..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Commission Plan <span className="font-normal text-gray-400">(shown on marketing page)</span></p>
            <div className="max-w-xs">
              <label className="block text-sm font-medium text-gray-700 mb-1">Commission %</label>
              <p className="text-xs text-gray-400 mb-2">Platform fee taken from each booking (e.g. 5 = 5%)</p>
              <input
                type="number" min={0} max={100} step={0.1}
                value={commissionPct}
                onChange={e => setCommissionPct(e.target.value)}
                placeholder="5"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Display Prices <span className="font-normal text-gray-400">(shown on marketing/pricing page)</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Price</label>
                <p className="text-xs text-gray-400 mb-2">e.g. $49/mo</p>
                <input
                  type="text"
                  value={monthlyDisplay}
                  onChange={e => setMonthlyDisplay(e.target.value)}
                  placeholder="$49/mo"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Annual Price</label>
                <p className="text-xs text-gray-400 mb-2">e.g. $399/yr</p>
                <input
                  type="text"
                  value={annualDisplay}
                  onChange={e => setAnnualDisplay(e.target.value)}
                  placeholder="$399/yr"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4 h-4" /> Support Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Operators and visitors who click &ldquo;Contact support&rdquo; on the support page will send an email to this address.
          </p>
          <div className="max-w-sm">
            <label className="block text-sm font-medium text-gray-700 mb-1">Support email address</label>
            <p className="text-xs text-gray-400 mb-2">e.g. support@boothgen.com</p>
            <input
              type="email"
              value={supportEmail}
              onChange={e => setSupportEmail(e.target.value)}
              placeholder="support@yourdomain.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </CardContent>
      </Card>

      <div>
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save All Settings'}
        </Button>
      </div>
    </div>
  );
}
