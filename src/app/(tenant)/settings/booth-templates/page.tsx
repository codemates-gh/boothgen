'use client';
import { useState, useEffect } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent } from '@/components/ui/card';
import { Layout, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DesignBriefSettings } from '@/components/settings/DesignBriefSettings';
import { LayoutPreview, type Layout as GenieLayout } from '@/components/genie/parts';

const TABS = [['branding','Branding'],['packages','Packages'],['billing','Billing'],['team','Team'],['coupons','Coupons'],['embed','Lead Capture'],['checklists','Checklists'],['booth-templates','Booth Templates'],['profile','Profile'],['import','Import'],['print-costs','Print Costs']];

const FORMAT_LABEL: Record<string, string> = { '2x6': '2"×6" Strip', '4x6': '4"×6" Full Size' };

type Template = { id: string; name: string; description?: string; format: string; orientation: string; photoCount: number; thumbnailUrl?: string; colorVariants: unknown[]; fontPairings: unknown[]; textZones: unknown[]; layout: GenieLayout | null; scope: 'standard' | 'mine'; hidden?: boolean };

export default function BoothTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const router = useRouter();
  const [error, setError] = useState('');

  // Standard layouts: hide from your clients' design picker, or show again
  async function setHidden(t: Template, hidden: boolean) {
    setError('');
    const r = await fetch('/api/template-library/hidden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ templateId: t.id, hidden }) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Could not change it'); return; }
    setTemplates(ts => ts.map(x => x.id === t.id ? { ...x, hidden } : x));
  }

  useEffect(() => {
    // Genie accounts manage templates and the design brief in Genie → Templates
    fetch('/api/genie-templates').then(r => { if (r.ok) router.replace('/genie/templates#design-brief'); });
    fetch('/api/settings/booth-templates').then(r => r.json()).then(setTemplates);
  }, [router]);

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

        <DesignBriefSettings/>

        {/* Shared Template Library */}
        <div>
          <h3 className="font-semibold text-gray-800 mb-1">Available Layout Templates</h3>
          <p className="text-sm text-gray-500 mb-4">Booth Genius Standard layouts, plus your own templates you offer to clients. Clients pick from these when the design brief is enabled. Hide any Standard layout you don&apos;t offer.</p>
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          {templates.length === 0 ? (
            <Card><CardContent className="text-center py-12 text-gray-400">
              <Layout className="w-10 h-10 mx-auto mb-3 opacity-30"/>
              <p className="font-medium">No templates published yet</p>
              <p className="text-sm mt-1">Booth Genius will publish layout templates here as they become available.</p>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(t => (
                <Card key={t.id} className={t.hidden ? 'opacity-60' : ''}>
                  <CardContent className="p-0">
                    {t.thumbnailUrl ? (
                      <img src={t.thumbnailUrl} alt={t.name} className="w-full h-40 object-contain bg-gray-50 p-2 rounded-t-xl"/>
                    ) : (
                      <div className="w-full h-40 bg-gray-50 rounded-t-xl flex items-center justify-center">
                        {t.layout ? <LayoutPreview layout={t.layout} width={Math.round(130 * t.layout.widthPx / t.layout.heightPx)}/> : <Layout className="w-10 h-10 text-gray-300"/>}
                      </div>
                    )}
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm">{t.name}</p>
                        {t.hidden ? <Badge variant="default">Hidden</Badge> : t.scope === 'mine' && <Badge variant="info">Yours</Badge>}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {FORMAT_LABEL[t.format] ?? t.format} · {t.orientation} · {t.photoCount} photo{t.photoCount === 1 ? '' : 's'}
                      </p>
                      {t.description && <p className="text-xs text-gray-400 mt-1">{t.description}</p>}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{(t.colorVariants as unknown[]).length} palettes</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{(t.fontPairings as unknown[]).length} font styles</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{(t.textZones as unknown[]).length} text zones</span>
                      </div>
                      {t.scope === 'standard' && (
                        <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => setHidden(t, !t.hidden)}>
                          {t.hidden ? <><Eye className="w-3.5 h-3.5 mr-1"/>Show to clients</> : <><EyeOff className="w-3.5 h-3.5 mr-1"/>Hide from clients</>}
                        </Button>
                      )}
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
