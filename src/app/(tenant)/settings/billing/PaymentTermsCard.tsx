'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Banknote } from 'lucide-react';

export function PaymentTermsCard() {
  const [depositPercent, setDepositPercent] = useState('50');
  const [balanceDueDays, setBalanceDueDays] = useState('30');
  const [fullPaymentDays, setFullPaymentDays] = useState('14');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings/branding')
      .then(r => r.json())
      .then(d => {
        if (d.defaultDepositPercent != null) setDepositPercent(String(d.defaultDepositPercent));
        if (d.balanceDueDaysBeforeEvent != null) setBalanceDueDays(String(d.balanceDueDaysBeforeEvent));
        if (d.fullPaymentIfWithinDays != null) setFullPaymentDays(String(d.fullPaymentIfWithinDays));
      });
  }, []);

  async function save() {
    setSaving(true);
    await fetch('/api/settings/branding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        defaultDepositPercent: parseInt(depositPercent) || 50,
        balanceDueDaysBeforeEvent: parseInt(balanceDueDays) || 30,
        fullPaymentIfWithinDays: parseInt(fullPaymentDays) || 14,
      }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Banknote className="w-5 h-5" />
          Payment Terms
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-gray-500">
          Defaults applied when creating new invoices. You can override per invoice.
        </p>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Deposit
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min="1" max="99"
                value={depositPercent}
                onChange={e => setDepositPercent(e.target.value)}
                className="w-20"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Collected at booking</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Balance Due
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min="0" max="365"
                value={balanceDueDays}
                onChange={e => setBalanceDueDays(e.target.value)}
                className="w-20"
              />
              <span className="text-sm text-gray-500">days before event</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Auto-fills balance due date</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Payment Window
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min="0" max="365"
                value={fullPaymentDays}
                onChange={e => setFullPaymentDays(e.target.value)}
                className="w-20"
              />
              <span className="text-sm text-gray-500">days</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">Require full payment if event is within this many days</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Payment Terms'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
