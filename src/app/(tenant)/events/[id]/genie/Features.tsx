'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Event → Genie: "What's in this event?" switches at the top, and a section per feature that's one line while off
// and opens when switched on (it can also be folded; the page remembers which ones per browser)

export type Feature = {
  id: string; icon: any; title: string; line: string; on: boolean;
  onToggle: (on: boolean) => void;
  // e.g. "$25 add-on"
  badge?: string;
  // Why it can't be switched on right now (e.g. needs the Photo booth)
  blocked?: string;
};

// A small on/off switch without its own label (the card or header names it)
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={'relative w-10 h-6 rounded-full flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ' + (checked ? 'bg-brand' : 'bg-gray-200')}>
      <span className={'absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow transition-transform ' + (checked ? 'translate-x-5' : 'translate-x-1')}/>
    </button>
  );
}

export function FeaturePanel({ features, disabled }: { features: Feature[]; disabled?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What&apos;s in this event?</CardTitle>
        <p className="text-sm text-gray-500">Switch on what the booth offers. Each one opens its settings below; ones that are off stay folded away.</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {features.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.id} className={'flex items-start gap-3 p-3 rounded-lg border ' + (f.on ? 'border-brand/40 bg-brand/5' : 'border-gray-100')}>
                <Icon className={'w-4 h-4 mt-0.5 flex-shrink-0 ' + (f.on ? 'text-brand' : 'text-gray-400')}/>
                <div className="flex-1 min-w-0">
                  <a href={'#' + f.id} className="text-sm font-medium hover:underline">{f.title}</a>
                  {f.badge && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 align-middle">{f.badge}</span>}
                  <p className="text-xs text-gray-500 leading-snug">{f.blocked && !f.on ? f.blocked : f.line}</p>
                </div>
                <Switch checked={f.on} disabled={disabled || (!!f.blocked && !f.on)} label={f.title} onChange={f.onToggle}/>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

const foldKey = (id: string) => 'genie-section-folded:' + id;

// A feature's section: off = one line with its switch; on = the settings, foldable from the header
export function FeatureSection({ feature, usedBy, right, children }: { feature: Feature; usedBy?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const [folded, setFolded] = useState(false);
  useEffect(() => { try { setFolded(localStorage.getItem(foldKey(feature.id)) === '1'); } catch { /* private mode */ } }, [feature.id]);
  const fold = (v: boolean) => { setFolded(v); try { v ? localStorage.setItem(foldKey(feature.id), '1') : localStorage.removeItem(foldKey(feature.id)); } catch { /* ignore */ } };
  const Icon = feature.icon;
  const open = feature.on && !folded;
  return (
    <Card id={feature.id} className="scroll-mt-20">
      <CardHeader className={open ? undefined : 'pb-6'}>
        <div className="flex items-start gap-3">
          <button type="button" disabled={!feature.on} onClick={() => fold(!folded)} className="flex-1 min-w-0 text-left disabled:cursor-default" aria-expanded={open}>
            <CardTitle className="flex items-center gap-2">
              {feature.on ? (open ? <ChevronDown className="w-4 h-4 text-gray-400"/> : <ChevronRight className="w-4 h-4 text-gray-400"/>) : <span className="w-4"/>}
              <Icon className="w-4 h-4"/>{feature.title}
              {feature.badge && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">{feature.badge}</span>}
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1 ml-6">{feature.blocked && !feature.on ? feature.blocked : feature.line}{usedBy && <span className="text-gray-400"> · Used by {usedBy}</span>}</p>
          </button>
          {open && right}
          <Switch checked={feature.on} disabled={!!feature.blocked && !feature.on} label={feature.title} onChange={v => { feature.onToggle(v); if (v) fold(false); }}/>
        </div>
      </CardHeader>
      {open && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  );
}

// A section without an on/off switch that can still be folded from its header (open by default; remembered per browser)
export function FoldSection({ id, icon: Icon, title, description, right, children }: { id: string; icon: any; title: string; description?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const [folded, setFolded] = useState(false);
  useEffect(() => { try { setFolded(localStorage.getItem(foldKey(id)) === '1'); } catch { /* private mode */ } }, [id]);
  const fold = (v: boolean) => { setFolded(v); try { v ? localStorage.setItem(foldKey(id), '1') : localStorage.removeItem(foldKey(id)); } catch { /* ignore */ } };
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader className={folded ? 'pb-6' : undefined}>
        <div className="flex items-start gap-3">
          <button type="button" onClick={() => fold(!folded)} className="flex-1 min-w-0 text-left" aria-expanded={!folded}>
            <CardTitle className="flex items-center gap-2">
              {folded ? <ChevronRight className="w-4 h-4 text-gray-400"/> : <ChevronDown className="w-4 h-4 text-gray-400"/>}
              <Icon className="w-4 h-4"/>{title}
            </CardTitle>
            {description && <p className="text-sm text-gray-500 mt-1 ml-6">{description}</p>}
          </button>
          {!folded && right}
        </div>
      </CardHeader>
      {!folded && <CardContent className="space-y-4">{children}</CardContent>}
    </Card>
  );
}

// A heading between groups of sections
export function GroupHeading({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}
