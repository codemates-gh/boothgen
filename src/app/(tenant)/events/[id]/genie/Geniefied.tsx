'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, Toggle } from '@/components/genie/parts';
import { ThemeThumb, type AiTheme } from '@/components/genie/AiThemes';
import { fmtCents } from '@/lib/utils';

export type AiBoothValue = {
  enabled: boolean; mode: 'beforeStart' | 'fixedTheme' | 'afterReview'; themeIds: string[]; fixedThemeId: string | null;
  consentText: string | null; waitSeconds: number; readyText: string | null;
};
export type GeniefiedInfo = {
  available: boolean; allowance: { covered: boolean; total: number; used: number; left: number }; trialRenders: number; rendersIncluded: number;
  topUp: { renders: number; priceCents: number }; defaultConsentText: string; defaultReadyText: string;
};

const MODES = [
  { value: 'beforeStart', label: 'Guests choose before Start', hint: 'A “Get Geniefied” step with the themes, or “No thanks”.' },
  { value: 'fixedTheme', label: 'One theme for everyone', hint: 'Every photo session is Geniefied in the same theme.' },
  { value: 'afterReview', label: 'Offer it on the review screen', hint: 'Guests see their photos first, then can Geniefy them.' },
] as const;

// Event → Genie → Geniefied (Genie P13): the AI photo booth. A paid add-on per event with a render allowance; before it's
// paid the event has a few trial renders and the watermark. Themes come from Genie → Geniefied Themes (and BoothGen's Standard set).
export function GeniefiedFields({ value, info, priceCents, disabled, onChange, onTopUp, topUpBusy }: {
  value: AiBoothValue; info: GeniefiedInfo; priceCents: number; disabled?: boolean;
  onChange: (v: Partial<AiBoothValue>) => void; onTopUp: () => void; topUpBusy: boolean;
}) {
  const [themes, setThemes] = useState<AiTheme[] | null>(null);
  useEffect(() => {
    fetch('/api/genie-ai-themes').then(r => r.json()).then(d => setThemes([...(d.mine ?? []), ...(d.standard ?? [])])).catch(() => setThemes([]));
  }, []);
  const chosen = value.themeIds.map(id => themes?.find(t => t.id === id)).filter((t): t is AiTheme => !!t);
  const others = (themes ?? []).filter(t => !value.themeIds.includes(t.id));
  const move = (i: number, d: -1 | 1) => { const ids = [...value.themeIds]; [ids[i], ids[i + d]] = [ids[i + d], ids[i]]; onChange({ themeIds: ids }); };
  const remove = (id: string) => onChange({ themeIds: value.themeIds.filter(x => x !== id), ...(value.fixedThemeId === id ? { fixedThemeId: null } : {}) });
  const a = info.allowance;

  return (
    <div className="space-y-4">
      <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label="Use Geniefied at this event"
        hint={`Guests restyle their photos in themes you choose. Add-on: ${fmtCents(priceCents)} for this event with ${info.rendersIncluded} renders (each photo is one render), paid with the event. Until it's paid you get ${info.trialRenders} trial renders and the photos show a watermark.`}/>
      {value.enabled && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <span className="flex-1">{a.covered ? `Renders: ${a.used} of ${a.total} used, ${a.left} left.` : `Trial renders: ${a.used} of ${a.total} used. Pay for Geniefied to get ${info.rendersIncluded}.`}</span>
            {a.covered && <Button size="sm" variant="outline" onClick={onTopUp} disabled={topUpBusy}>{topUpBusy ? 'Opening…' : `Add ${info.topUp.renders} renders (${fmtCents(info.topUp.priceCents)})`}</Button>}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">When guests get Geniefied</p>
            {MODES.map(m => (
              <label key={m.value} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" name="aiMode" className="mt-1" checked={value.mode === m.value} disabled={disabled} onChange={() => onChange({ mode: m.value })}/>
                <span><span className="font-medium">{m.label}</span><span className="block text-xs text-gray-500">{m.hint}</span></span>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Themes, in the order guests see them</p>
            {themes === null ? <p className="text-sm text-gray-400">Loading themes…</p> : (
              <>
                {chosen.length === 0 && <p className="text-sm text-gray-500">No themes yet. Add some below.</p>}
                <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
                  {chosen.map((t, i) => (
                    <div key={t.id} className="flex items-center gap-3 px-3 py-2">
                      <ThemeThumb theme={t} className="w-12 h-12 rounded-md flex-shrink-0"/>
                      <span className="text-sm flex-1">{t.name}{t.source === 'account' && <span className="text-xs text-gray-400"> · My theme</span>}{(!t.sample || t.placeholder) && <span className="block text-xs text-gray-500">Placeholder picture until a sample is made</span>}</span>
                      {value.mode === 'fixedTheme' && (
                        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                          <input type="radio" name="aiFixed" checked={value.fixedThemeId === t.id} disabled={disabled} onChange={() => onChange({ fixedThemeId: t.id })}/>Everyone
                        </label>
                      )}
                      <button type="button" disabled={disabled || i === 0} onClick={() => move(i, -1)} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move up"><ChevronUp className="w-4 h-4"/></button>
                      <button type="button" disabled={disabled || i === chosen.length - 1} onClick={() => move(i, 1)} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" aria-label="Move down"><ChevronDown className="w-4 h-4"/></button>
                      <button type="button" disabled={disabled} onClick={() => remove(t.id)} className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-30">Remove</button>
                    </div>
                  ))}
                </div>
                {others.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {others.map(t => (
                      <button key={t.id} type="button" disabled={disabled} onClick={() => onChange({ themeIds: [...value.themeIds, t.id] })}
                        className="text-left rounded-lg border border-gray-200 hover:border-brand p-1 disabled:opacity-50" title={`Add ${t.name}`}>
                        <ThemeThumb theme={t} className="w-full aspect-square rounded-md"/>
                        <span className="block text-xs mt-1 truncate">+ {t.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-500">Make your own in <Link href="/genie/themes" className="text-brand hover:underline">Genie → Geniefied Themes</Link>.</p>
              </>
            )}
          </div>

          <Field label="Consent text" hint={`Guests tap “I agree” to this before their first Geniefied photo. ${(value.consentText ?? '').length}/600 · leave empty for BoothGen's wording`}>
            <Textarea rows={3} maxLength={600} value={value.consentText ?? ''} placeholder={info.defaultConsentText} disabled={disabled}
              onChange={e => onChange({ consentText: e.target.value || null })}/>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Wait at most (sec)" hint="15–120. After that the guest gets the normal photos now and the Geniefied ones by text or email.">
              <Input type="number" min={15} max={120} value={value.waitSeconds} disabled={disabled} onChange={e => onChange({ waitSeconds: Math.max(15, Math.min(120, Number(e.target.value) || 45)) })}/>
            </Field>
          </div>
          <Field label="“Your Geniefied photo is ready” message" hint="Sent to guests who already got their photos when a Geniefied one arrives later. {{eventName}} and {{link}} work. Leave empty for BoothGen's wording.">
            <Textarea rows={2} maxLength={500} value={value.readyText ?? ''} placeholder={info.defaultReadyText} disabled={disabled}
              onChange={e => onChange({ readyText: e.target.value || null })}/>
          </Field>
        </>
      )}
    </div>
  );
}
