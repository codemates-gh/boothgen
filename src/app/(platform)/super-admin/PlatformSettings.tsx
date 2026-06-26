'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Image, CreditCard, Mail, MessageCircle, Users, FileText } from 'lucide-react';

interface InitialSettings {
  message_retention_months: string;
  gallery_expire_days: string;
  gallery_delete_days: string;
  stripe_price_monthly_id: string;
  price_display_monthly: string;
  commission_percentage: string;
  support_email: string;
  chatbot_enabled: boolean;
  early_adopter_cap: string;
  terms_url: string;
  privacy_url: string;
}

export default function PlatformSettings({ initial, proSubscriberCount }: { initial: InitialSettings; proSubscriberCount: number }) {
  const [months, setMonths]   = useState(initial.message_retention_months);
  const [expireDays, setExpireDays] = useState(initial.gallery_expire_days);
  const [deleteDays, setDeleteDays] = useState(initial.gallery_delete_days);
  const [monthlyPriceId, setMonthlyPriceId] = useState(initial.stripe_price_monthly_id);
  const [monthlyDisplay, setMonthlyDisplay] = useState(initial.price_display_monthly);
  const [commissionPct, setCommissionPct]   = useState(initial.commission_percentage);
  const [supportEmail, setSupportEmail]     = useState(initial.support_email);
  const [chatbotEnabled, setChatbotEnabled] = useState(initial.chatbot_enabled);
  const [earlyAdopterCap, setEarlyAdopterCap] = useState(initial.early_adopter_cap);
  const [termsUrl, setTermsUrl]               = useState(initial.terms_url);
  const [privacyUrl, setPrivacyUrl]           = useState(initial.privacy_url);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const cap = parseInt(earlyAdopterCap) || 50;
  const spotsRemaining = Math.max(0, cap - proSubscriberCount);
  const capFull = proSubscriberCount >= cap;

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
        price_display_monthly: monthlyDisplay,
        commission_percentage: commissionPct,
        support_email: supportEmail,
        chatbot_enabled: chatbotEnabled ? 'true' : 'false',
        early_adopter_cap: earlyAdopterCap,
        terms_url: termsUrl,
        privacy_url: privacyUrl,
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
            <p className="text-sm font-medium text-gray-700 mb-1">Pro Monthly Display Price <span className="font-normal text-gray-400">(shown on /pricing page)</span></p>
            <p className="text-xs text-gray-400 mb-2">Number only, e.g. 25</p>
            <div className="max-w-xs">
              <input
                type="number" min={0} step={1}
                value={monthlyDisplay}
                onChange={e => setMonthlyDisplay(e.target.value)}
                placeholder="25"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4" /> Early Adopter Cap
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Limit introductory Pro plan signups. When the cap is reached, the pricing page shows "All spots claimed" and new subscribers cannot sign up at the introductory rate.
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="w-4 h-4" /> AI Support Chatbot
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Controls the floating AI chat widget on the public support page. Disable it to stop Gemini API usage while you evaluate costs.
          </p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setChatbotEnabled(v => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 ${chatbotEnabled ? 'bg-green-500' : 'bg-gray-300'}`}
              role="switch"
              aria-checked={chatbotEnabled}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${chatbotEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm font-medium text-gray-700">
              {chatbotEnabled ? 'Chatbot enabled — visible on /support' : 'Chatbot disabled — chat widget hidden'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" /> Legal Pages
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Paste the public URLs for your Terms of Service and Privacy Policy pages. These links appear in the marketing footer and on the sign-up form as a required acknowledgement checkbox.
            Leave blank to hide the links and skip the checkbox.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Terms of Service URL</label>
              <p className="text-xs text-gray-400 mb-2">e.g. https://boothgen.com/terms</p>
              <input
                type="url"
                value={termsUrl}
                onChange={e => setTermsUrl(e.target.value)}
                placeholder="https://"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Privacy Policy URL</label>
              <p className="text-xs text-gray-400 mb-2">e.g. https://boothgen.com/privacy</p>
              <input
                type="url"
                value={privacyUrl}
                onChange={e => setPrivacyUrl(e.target.value)}
                placeholder="https://"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
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
