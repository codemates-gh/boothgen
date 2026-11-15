'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Tablet, Briefcase, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BoothGeniusIcon } from '@/components/brand/BoothGeniusLogo';
import { TimeZoneSelect } from '@/components/genie/SettingsForms';

type Choice = 'genie' | 'genius';

// Genie (the iPad booth app, pay per event) is the default; Genius is the full CRM with Genie included.
// Plan: docs/genie/genie-only-plan.md
const CHOICES: [Choice, typeof Tablet, string, string, string[]][] = [
  ['genie', Tablet, 'Genie', '$15 per event', ['iPad photo booth app', 'Layouts, props and backdrops', 'Guest texts, email and galleries included', 'No monthly fee']],
  ['genius', Briefcase, 'Genius', 'Monthly plan, free trial', ['Everything in Genie', 'Leads, quotes, contracts and invoices', 'Client portal and automations', 'Calendar and analytics']],
];

export default function OnboardingPage() {
  const [product, setProduct] = useState<Choice>('genie');
  const [name, setName] = useState('');
  const [timeZone, setTimeZone] = useState('America/New_York');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { update } = useSession();
  const router = useRouter();

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('product');
    if (p === 'genius' || p === 'crm') setProduct('genius');
    try { setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'); } catch {}
  }, []);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/onboarding/create-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), product, ...(product === 'genie' ? { timeZone } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create company');
      // Refresh JWT so tenantId is included in session
      await update();
      router.push(product === 'genie' ? '/genie/events' : '/dashboard');
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-xl">
        <div className="flex items-center gap-3 mb-6">
          <BoothGeniusIcon size={40} />
          <div>
            <h1 className="text-xl font-bold">Welcome to Booth Genius</h1>
            <p className="text-sm text-gray-500">Let&apos;s set up your business</p>
          </div>
        </div>
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="What do you want to use?">
            {CHOICES.map(([value, Icon, title, price, points]) => (
              <button key={value} type="button" role="radio" aria-checked={product === value} onClick={() => setProduct(value)} disabled={loading}
                className={'text-left border-2 rounded-xl p-4 transition-colors ' + (product === value ? 'border-brand bg-orange-50/40' : 'border-gray-200 hover:border-gray-300')}>
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-2 font-semibold text-gray-900"><Icon className="w-4 h-4"/>{title}</span>
                  {product === value && <CheckCircle2 className="w-4 h-4 text-brand"/>}
                </div>
                <p className="text-xs text-gray-500 mb-2">{price}</p>
                <ul className="space-y-1">{points.map(p => <li key={p} className="text-xs text-gray-600">• {p}</li>)}</ul>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 -mt-2">You can switch from Genie to Genius later and keep everything.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pixel Perfect Photo Booths" onKeyDown={e => e.key === 'Enter' && handleCreate()} disabled={loading} />
          </div>
          {product === 'genie' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Zone</label>
              <TimeZoneSelect value={timeZone} onChange={setTimeZone} disabled={loading}/>
              <p className="text-xs text-gray-400 mt-1">Where most of your events happen. You can change it per event.</p>
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <Button className="w-full" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Setting up…' : product === 'genie' ? 'Start with Genie →' : 'Start my Genius trial →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
