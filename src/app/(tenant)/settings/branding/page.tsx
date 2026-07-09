'use client';
import { useState, useEffect, useRef } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import Image from 'next/image';
import { Camera, Upload } from 'lucide-react';

const tabs = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['checklists','Checklists'],['profile','Profile'],['import','Import']];

export default function BrandingSettingsPage() {
  const [form, setForm] = useState({ companyName:'', primaryColor:'#F97316', secondaryColor:'#EA6100', replyToEmail:'', supportPhone:'', websiteUrl:'', businessAddress:'', invoiceFooterText:'', emailHeaderHtml:'' });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch('/api/settings/branding').then(r => r.json()).then(d => {
      if (d && !d.error) {
        setForm(p => ({ ...p, ...d }));
        setLogoUrl(d.logoUrl ?? null);
      }
    });
  }, []);

  async function save() {
    setSaving(true);
    await fetch('/api/settings/branding', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000);
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const res = await fetch('/api/settings/branding/logo', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) setLogoUrl(data.url);
      else alert('Upload failed: ' + (data.error || 'Unknown error'));
    } catch (err) {
      alert('Upload failed. Check browser console for details.');
      console.error('[LOGO_UPLOAD]', err);
    } finally {
      setUploadingLogo(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">
        <div className="flex flex-wrap border-b border-gray-200 mb-6">
          {tabs.map(([href, label]) => <Link key={href} href={'/settings/' + href} className={'px-4 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ' + (href === 'branding' ? 'border-[#0085FF] text-[#1F1F3D]' : 'border-transparent text-[#676879] hover:text-[#1F1F3D]')}>{label}</Link>)}
        </div>

        <Card>
          <CardHeader><CardTitle>Company Logo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 flex-shrink-0 overflow-hidden">
                {logoUrl ? (
                  <Image src={logoUrl} alt="Logo" width={80} height={80} className="w-full h-full object-contain" unoptimized />
                ) : (
                  <Camera className="w-8 h-8 text-gray-300" />
                )}
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-600">Upload a file or paste a URL. PNG or SVG recommended.</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploadingLogo}>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  {uploadingLogo ? 'Uploading...' : logoUrl ? 'Replace File' : 'Upload File'}
                </Button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Logo URL</label>
              <div className="flex gap-2">
                <Input
                  type="url"
                  value={logoUrl ?? ''}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://cdn.yourdomain.com/logo.png"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!logoUrl) return;
                    await fetch('/api/settings/branding', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logoUrl }) });
                    setSaved(true); setTimeout(() => setSaved(false), 2000);
                  }}
                >
                  Save URL
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">Paste the URL of an image hosted anywhere (Cloudflare, CDN, etc.)</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Company Branding</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label><Input value={form.companyName} onChange={e => set('companyName',e.target.value)} placeholder="Pixel Perfect Photo Booths"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label><div className="flex gap-2"><input type="color" value={form.primaryColor} onChange={e => set('primaryColor',e.target.value)} className="h-10 w-12 rounded border border-gray-300 p-1 cursor-pointer"/><Input value={form.primaryColor} onChange={e => set('primaryColor',e.target.value)} className="font-mono"/></div></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label><div className="flex gap-2"><input type="color" value={form.secondaryColor} onChange={e => set('secondaryColor',e.target.value)} className="h-10 w-12 rounded border border-gray-300 p-1 cursor-pointer"/><Input value={form.secondaryColor} onChange={e => set('secondaryColor',e.target.value)} className="font-mono"/></div></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Reply-to Email</label><Input type="email" value={form.replyToEmail} onChange={e => set('replyToEmail',e.target.value)} placeholder="hello@yourdomain.com"/></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Support Phone</label><Input value={form.supportPhone} onChange={e => set('supportPhone',e.target.value)} placeholder="(555) 123-4567"/></div>
            <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Business Address</label><Input value={form.businessAddress} onChange={e => set('businessAddress',e.target.value)} placeholder="123 Main St, Laurel, MD 20707"/><p className="text-xs text-gray-400 mt-1">Used to show local weather on the dashboard.</p></div>
            <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Website URL</label><Input value={form.websiteUrl} onChange={e => set('websiteUrl',e.target.value)} placeholder="https://yourbusiness.com"/></div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Signature</label>
              <p className="text-xs text-gray-400 mb-1.5">Available as <code className="bg-gray-100 px-1 rounded">{'{{host.signature}}'}</code> in email templates</p>
              <Textarea value={form.emailHeaderHtml} onChange={e => set('emailHeaderHtml',e.target.value)} placeholder={"Warm regards,\nYour Name\nYour Company\n(555) 123-4567"} className="h-28 resize-none"/>
            </div>
            <div className="sm:col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">Invoice Footer</label><Textarea value={form.invoiceFooterText} onChange={e => set('invoiceFooterText',e.target.value)} placeholder="Thank you for your business!"/></div>
            <div className="sm:col-span-2 flex justify-end"><Button onClick={save} disabled={saving}>{saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}</Button></div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
