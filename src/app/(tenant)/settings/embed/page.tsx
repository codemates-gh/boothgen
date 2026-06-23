'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Check, ExternalLink, Globe, Save } from 'lucide-react';

interface FormConfig {
  heading: string;
  buttonText: string;
  successHeading: string;
  successMessage: string;
  showPhone: boolean;
  showEventDate: boolean;
  showEventType: boolean;
  showTimes: boolean;
  showGuestCount: boolean;
  showVenue: boolean;
  showMessage: boolean;
  requirePhone: boolean;
  requireEventDate: boolean;
}

const DEFAULT_CONFIG: FormConfig = {
  heading: 'Book with {{company}}',
  buttonText: 'Send My Inquiry',
  successHeading: 'We received your inquiry!',
  successMessage: "We'll be in touch within 1-2 business days.",
  showPhone: true, showEventDate: true, showEventType: true, showTimes: true,
  showGuestCount: true, showVenue: true, showMessage: true,
  requirePhone: false, requireEventDate: true,
};

export default function EmbedPage() {
  const [tenant, setTenant] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [formConfig, setFormConfig] = useState<FormConfig>(DEFAULT_CONFIG);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings/branding').then(r => r.json()).then(d => {
      setTenant(d);
      if (d.leadFormConfig) setFormConfig({ ...DEFAULT_CONFIG, ...d.leadFormConfig });
    });
  }, []);

  const setFc = (k: keyof FormConfig, v: any) => setFormConfig(f => ({ ...f, [k]: v }));

  async function saveConfig() {
    setSaving(true);
    await fetch('/api/settings/branding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadFormConfig: formConfig }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://boothgen.vercel.app';
  const slug = tenant?.tenantSlug ?? tenant?.slug ?? 'your-slug';
  const embedUrl = `${appUrl}/embed/${slug}/inquiry`;

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const CopyBtn = ({ id, text }: { id: string; text: string }) => (
    <Button size="sm" variant="outline" onClick={() => copy(id, text)} className="flex-shrink-0">
      {copied === id ? <><Check className="w-3 h-3 mr-1 text-green-500"/>Copied!</> : <><Copy className="w-3 h-3 mr-1"/>Copy</>}
    </Button>
  );

  const basicEmbed = `<iframe 
  src="${embedUrl}"
  width="100%"
  height="700"
  frameborder="0"
  style="border:none;border-radius:12px"
  title="Book Your Photo Booth">
</iframe>`;

  const autoResizeEmbed = `<iframe 
  id="boothgen-form"
  src="${embedUrl}"
  width="100%"
  frameborder="0"
  style="border:none;min-height:600px">
</iframe>
<script>
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'pbcrm:resize') {
      document.getElementById('boothgen-form').style.height = e.data.height + 'px';
    }
  });
</script>`;

  const wordpressEmbed = `[html]
<iframe 
  src="${embedUrl}"
  width="100%"
  height="700"
  frameborder="0"
  style="border:none;border-radius:12px">
</iframe>
[/html]`;

  return (
    <>
      <TopBar title="Lead Capture Embed" />
      <div className="p-4 sm:p-8 max-w-3xl space-y-6">

        <div className="bg-brand-surface border border-brand/20 rounded-xl p-4 flex items-start gap-3">
          <Globe className="w-5 h-5 text-brand mt-0.5 flex-shrink-0"/>
          <div>
            <p className="font-semibold text-brand-dark">Embed on your website</p>
            <p className="text-sm text-gray-600 mt-1">Add the inquiry form to any website. Leads go straight into your CRM automatically.</p>
          </div>
        </div>

        {/* Preview link */}
        <Card>
          <CardHeader><CardTitle className="text-base">Your Form URL</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 break-all">{embedUrl}</code>
              <CopyBtn id="url" text={embedUrl}/>
            </div>
            <a href={embedUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm"><ExternalLink className="w-3 h-3 mr-2"/>Preview Form</Button>
            </a>
          </CardContent>
        </Card>

        {/* Basic embed */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Basic Embed</CardTitle>
                <p className="text-sm text-gray-500 mt-0.5">Fixed height — works everywhere</p>
              </div>
              <CopyBtn id="basic" text={basicEmbed}/>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-900 text-green-400 rounded-xl p-4 text-xs overflow-x-auto whitespace-pre-wrap">{basicEmbed}</pre>
          </CardContent>
        </Card>

        {/* Auto-resize embed */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">Auto-Resize Embed <span className="text-xs bg-brand text-white px-2 py-0.5 rounded-full">Recommended</span></CardTitle>
                <p className="text-sm text-gray-500 mt-0.5">Automatically adjusts height — best user experience</p>
              </div>
              <CopyBtn id="auto" text={autoResizeEmbed}/>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-900 text-green-400 rounded-xl p-4 text-xs overflow-x-auto whitespace-pre-wrap">{autoResizeEmbed}</pre>
          </CardContent>
        </Card>

        {/* WordPress */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">WordPress</CardTitle>
                <p className="text-sm text-gray-500 mt-0.5">Use in a Custom HTML block</p>
              </div>
              <CopyBtn id="wp" text={basicEmbed}/>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <pre className="bg-gray-900 text-green-400 rounded-xl p-4 text-xs overflow-x-auto whitespace-pre-wrap">{basicEmbed}</pre>
            <p className="text-xs text-gray-500">In WordPress editor: Add Block → Custom HTML → paste the code</p>
          </CardContent>
        </Card>

        {/* Form Customization */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Form Customization</CardTitle>
              <Button size="sm" onClick={saveConfig} disabled={saving} className="flex items-center gap-1.5">
                {saved ? <><Check className="w-3.5 h-3.5"/>Saved</> : saving ? 'Saving…' : <><Save className="w-3.5 h-3.5"/>Save</>}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Form Heading</label>
                <Input value={formConfig.heading} onChange={e => setFc('heading', e.target.value)} placeholder="Book with {{company}}" />
                <p className="text-xs text-gray-400 mt-1">Use {'{{company}}'} for your company name</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Submit Button Text</label>
                <Input value={formConfig.buttonText} onChange={e => setFc('buttonText', e.target.value)} placeholder="Send My Inquiry" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Success Heading</label>
                <Input value={formConfig.successHeading} onChange={e => setFc('successHeading', e.target.value)} placeholder="We received your inquiry!" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Success Message</label>
                <Input value={formConfig.successMessage} onChange={e => setFc('successMessage', e.target.value)} placeholder="We'll be in touch within 1-2 business days." />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Fields to show</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  ['showPhone', 'Phone Number'],
                  ['showEventDate', 'Event Date'],
                  ['showEventType', 'Event Type'],
                  ['showTimes', 'Start / End Time'],
                  ['showGuestCount', 'Guest Count'],
                  ['showVenue', 'Venue Details'],
                  ['showMessage', 'Additional Notes'],
                ] as [keyof FormConfig, string][]).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" checked={formConfig[k] as boolean} onChange={e => setFc(k, e.target.checked)} className="w-4 h-4 rounded" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Required fields</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {([
                  ['requirePhone', 'Phone Number'],
                  ['requireEventDate', 'Event Date'],
                ] as [keyof FormConfig, string][]).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" checked={formConfig[k] as boolean} onChange={e => setFc(k, e.target.checked)} className="w-4 h-4 rounded" />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Platform instructions */}
        <Card>
          <CardHeader><CardTitle className="text-base">Platform Instructions</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            {[
              ['Wix', 'Add → Embed → HTML iFrame → paste the Basic Embed code'],
              ['Squarespace', 'Edit page → Add Block → Code → paste the Auto-Resize Embed code'],
              ['Webflow', 'Add Element → HTML Embed → paste the Auto-Resize Embed code'],
              ['GoDaddy Website Builder', 'Edit → Add Section → HTML → paste the Basic Embed code'],
              ['WordPress', 'Add Block → Custom HTML → paste the Basic Embed code'],
              ['Showit', 'Add Widget → HTML → paste the Basic Embed code'],
            ].map(([platform, instruction]) => (
              <div key={platform} className="flex gap-3">
                <p className="font-semibold w-44 flex-shrink-0 text-gray-700">{platform}</p>
                <p className="text-gray-500">{instruction}</p>
              </div>
            ))}
          </CardContent>
        </Card>

      </div>
    </>
  );
}
