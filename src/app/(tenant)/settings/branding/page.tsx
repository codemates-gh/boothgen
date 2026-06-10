'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team']];

export default function BrandingSettingsPage() {
  const [form, setForm] = useState({ companyName:'', primaryColor:'#F97316', secondaryColor:'#EA6100', replyToEmail:'', supportPhone:'', websiteUrl:'', invoiceFooterText:'' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  useEffect(() => { fetch('/api/settings/branding').then(r => r.json()).then(d => { if (d && !d.error) setForm(p => ({ ...p, ...d })); }); }, []);
  async function save() {
    setSaving(true);
    await fetch('/api/settings/branding', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000);
  }
  return (
    <>
      <TopBar title="Settings" />
      <div className="p-8 max-w-3xl space-y-6">
        <div className="flex gap-2 border-b pb-4">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2 rounded-lg text-sm font-medium ' + (href === 'branding' ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100')}>{label}</Link>)}
        </div>
        <Card>
          <CardHeader><CardTitle>Company Branding</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label><Input value={form.companyName} onChange={e => set('companyName',e.target.value)} placeholder="Pixel Perfect Photo Booths"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label><div className="flex gap-2"><input type="color" value={form.primaryColor} onChange={e => set('primaryColor',e.target.value)} className="h-10 w-12 rounded border border-gray-300 p-1 cursor-pointer"/><Input value={form.primaryColor} onChange={e => set('primaryColor',e.target.value)} className="font-mono"/></div></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label><div className="flex gap-2"><input type="color" value={form.secondaryColor} onChange={e => set('secondaryColor',e.target.value)} className="h-10 w-12 rounded border border-gray-300 p-1 cursor-pointer"/><Input value={form.secondaryColor} onChange={e => set('secondaryColor',e.target.value)} className="font-mono"/></div></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Reply-to Email</label><Input type="email" value={form.replyToEmail} onChange={e => set('replyToEmail',e.target.value)} placeholder="hello@yourdomain.com"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Support Phone</label><Input value={form.supportPhone} onChange={e => set('supportPhone',e.target.value)} placeholder="(555) 123-4567"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label><Input value={form.websiteUrl} onChange={e => set('websiteUrl',e.target.value)} placeholder="https://yourbusiness.com"/></div>
            <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Invoice Footer</label><Textarea value={form.invoiceFooterText} onChange={e => set('invoiceFooterText',e.target.value)} placeholder="Thank you for your business!"/></div>
            <div className="col-span-2 flex justify-end"><Button onClick={save} disabled={saving}>{saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}</Button></div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
