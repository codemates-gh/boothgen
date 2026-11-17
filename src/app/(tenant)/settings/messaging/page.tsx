'use client';
// Settings → Email & Texting: who client emails come from (name, reply-to) and how guests get texts and emails
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail } from 'lucide-react';
import { settingsTabs } from '@/lib/product';
import GuestMessagingSettings from '@/components/messaging/GuestMessagingSettings';

export default function MessagingSettingsPage() {
  const { data: session } = useSession();
  const product = session?.tenant?.product;
  const tabs = settingsTabs(product);
  const [form, setForm] = useState({ companyName: '', replyToEmail: '' });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings/branding').then(r => r.json()).then(d => {
      if (d && !d.error) setForm({ companyName: d.companyName ?? '', replyToEmail: d.replyToEmail ?? '' });
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true); setError('');
    const res = await fetch('/api/settings/branding', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyName: form.companyName.trim(), replyToEmail: form.replyToEmail.trim() || null }) });
    setSaving(false);
    if (!res.ok) { setError('Could not save'); return; }
    setSaved(true); setTimeout(() => setSaved(false), 3000);
  }

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <div className="flex flex-wrap border-b border-gray-200 mb-6">
          {tabs.map(([href, label]) => (
            <Link key={href} href={'/settings/' + href} className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ' + (href === 'messaging' ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>{label}</Link>
          ))}
        </div>

        {product !== 'genie' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Mail className="w-4 h-4"/>Client Emails</CardTitle>
              <p className="text-sm text-gray-500">Quotes, invoices, messages and automated emails to your clients come from your business name through BoothGen. Replies go to your reply-to email.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From name</label>
                <Input value={form.companyName} disabled={!loaded} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="Your business name"/>
                <p className="text-xs text-gray-400 mt-1">Also your business name on quotes, invoices and the client portal.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reply-to email</label>
                <Input type="email" value={form.replyToEmail} disabled={!loaded} onChange={e => setForm(f => ({ ...f, replyToEmail: e.target.value }))} placeholder="hello@yourdomain.com"/>
                <p className="text-xs text-gray-400 mt-1">Where client replies land. Without one, replies go to a no-reply address and you won&apos;t see them.</p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex items-center gap-3">
                <Button onClick={save} disabled={saving || !loaded || !form.companyName.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
                {saved && <span className="text-sm text-green-600">Saved</span>}
              </div>
              <p className="text-xs text-gray-500">What the emails say lives in <Link href="/messages/templates" className="text-[#0085FF] hover:underline">Messages → Templates</Link>, and when they go out in <Link href="/messages/automations" className="text-[#0085FF] hover:underline">Messages → Automations</Link>.</p>
            </CardContent>
          </Card>
        )}

        <GuestMessagingSettings />
      </div>
    </>
  );
}
