'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Layout, CheckCircle } from 'lucide-react';
import Link from 'next/link';

const TABS = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['checklists','Checklists'],['booth-templates','Booth Templates'],['profile','Profile'],['import','Import'],['print-costs','Print Costs'],['genie','Genie']];

const FORMAT_LABEL: Record<string, string> = { '2x6': '2"×6" Strip', '4x6': '4"×6" Full Size' };

type Template = { id: string; name: string; description?: string; format: string; orientation: string; photoCount: number; thumbnailUrl?: string; colorVariants: unknown[]; fontPairings: unknown[]; textZones: unknown[] };

export default function BoothTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [designBriefEnabled, setDesignBriefEnabled] = useState(false);
  const [customDesignEnabled, setCustomDesignEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings/booth-templates').then(r => r.json()).then(setTemplates);
    fetch('/api/settings/design-brief-settings').then(r => r.json()).then(d => {
      setDesignBriefEnabled(d.designBriefEnabled);
      setCustomDesignEnabled(d.customDesignEnabled);
    });
  }, []);

  async function saveSettings() {
    setSaving(true);
    await fetch('/api/settings/design-brief-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ designBriefEnabled, customDesignEnabled }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <>
      <TopBar title="Settings" />
      <div className="p-4 sm:p-8 max-w-5xl space-y-6">
        <nav className="flex flex-wrap gap-2">
          {TABS.map(([slug, label]) => (
            <Link key={slug} href={`/settings/${slug}`}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${slug === 'booth-templates' ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </Link>
          ))}
        </nav>

        <div>
          <h2 className="text-lg font-bold">Client Design Brief</h2>
          <p className="text-sm text-gray-500 mt-0.5">Let clients select a layout and customize colors, fonts, and text before you design.</p>
        </div>

        {/* Feature Toggles */}
        <Card>
          <CardContent className="space-y-4 py-5">
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative mt-0.5">
                <input type="checkbox" className="sr-only" checked={designBriefEnabled} onChange={e => setDesignBriefEnabled(e.target.checked)}/>
                <div className={`w-10 h-6 rounded-full transition-colors ${designBriefEnabled ? 'bg-brand' : 'bg-gray-200'}`}/>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${designBriefEnabled ? 'translate-x-5' : 'translate-x-1'}`}/>
              </div>
              <div>
                <p className="font-medium text-sm">Enable Design Brief</p>
                <p className="text-xs text-gray-500 mt-0.5">Show the design brief flow in the client portal. You activate it per event on the Designs tab.</p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative mt-0.5">
                <input type="checkbox" className="sr-only" checked={customDesignEnabled} onChange={e => setCustomDesignEnabled(e.target.checked)}/>
                <div className={`w-10 h-6 rounded-full transition-colors ${customDesignEnabled ? 'bg-brand' : 'bg-gray-200'}`}/>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${customDesignEnabled ? 'translate-x-5' : 'translate-x-1'}`}/>
              </div>
              <div>
                <p className="font-medium text-sm">Allow Custom Design Request</p>
                <p className="text-xs text-gray-500 mt-0.5">Clients can skip the template picker and describe a fully custom design instead.</p>
              </div>
            </label>

            <Button onClick={saveSettings} disabled={saving} size="sm">
              {saved ? <><CheckCircle className="w-4 h-4 mr-1.5"/>Saved</> : saving ? 'Saving…' : 'Save Settings'}
            </Button>
          </CardContent>
        </Card>

        {/* Shared Template Library */}
        <div>
          <h3 className="font-semibold text-gray-800 mb-1">Available Layout Templates</h3>
          <p className="text-sm text-gray-500 mb-4">These shared templates are managed by Booth Genius and available to your clients when the design brief is enabled.</p>
          {templates.length === 0 ? (
            <Card><CardContent className="text-center py-12 text-gray-400">
              <Layout className="w-10 h-10 mx-auto mb-3 opacity-30"/>
              <p className="font-medium">No templates published yet</p>
              <p className="text-sm mt-1">Booth Genius will publish layout templates here as they become available.</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(t => (
                <Card key={t.id}>
                  <CardContent className="p-0">
                    {t.thumbnailUrl ? (
                      <img src={t.thumbnailUrl} alt={t.name} className="w-full h-40 object-cover rounded-t-xl"/>
                    ) : (
                      <div className="w-full h-40 bg-gray-100 rounded-t-xl flex items-center justify-center">
                        <Layout className="w-10 h-10 text-gray-300"/>
                      </div>
                    )}
                    <div className="p-3">
                      <p className="font-semibold text-sm">{t.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {FORMAT_LABEL[t.format] ?? t.format} · {t.orientation} · {t.photoCount} photos
                      </p>
                      {t.description && <p className="text-xs text-gray-400 mt-1">{t.description}</p>}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{(t.colorVariants as unknown[]).length} palettes</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{(t.fontPairings as unknown[]).length} font styles</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{(t.textZones as unknown[]).length} text zones</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
