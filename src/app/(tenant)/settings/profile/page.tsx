'use client';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['checklists','Checklists'],['profile','Profile'],['import','Import']];

export default function ProfileSettingsPage() {
  const { update } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings/profile').then(r => r.json()).then(d => {
      if (d && !d.error) {
        setName(d.name ?? '');
        setEmail(d.email ?? '');
      }
    });
  }, []);

  async function save() {
    setError('');
    setSaving(true);
    const res = await fetch('/api/settings/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong');
      return;
    }
    await update();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <div className="flex flex-wrap border-b border-gray-200 mb-6">
          {tabs.map(([href, label]) => (
            <Link
              key={href}
              href={'/settings/' + href}
              className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ' + (href === 'profile' ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}
            >
              {label}
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle>Your Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-w-sm">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
              <p className="text-xs text-gray-400 mb-1.5">Shown in the sidebar and on your account</p>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <Input value={email} disabled className="bg-gray-50 text-gray-400 cursor-not-allowed" />
              <p className="text-xs text-gray-400 mt-1">Email cannot be changed here</p>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving || !name.trim()}>
                {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
