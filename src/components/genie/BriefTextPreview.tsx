'use client';
import { useMemo } from 'react';
import { Minus, Plus } from 'lucide-react';
import { LayoutPreview, type Layout } from './parts';
import { TextLayerCanvas } from './TextLayerCanvas';
import { DEFAULT_TEXT_COLORS, TEXT_SCALE_STEPS, sampleValues, type TextAdjust, type TextLook } from '@/lib/templates/textLayer';
import type { ColorVariant, FontPairing, TextZone } from '@/lib/templates/clientOptions';

// Client portal → Design: the chosen layout with the client's words drawn in, live, in their palette and fonts. Each
// text box's outline and shadow can be turned on or off and its size changed; they start the way the template maker set
// them. Fields still empty show the template's example words.

const nearestStep = (k: number) => TEXT_SCALE_STEPS.reduce((best, s, i) => Math.abs(s - k) < Math.abs(TEXT_SCALE_STEPS[best] - k) ? i : best, 0);

export function BriefTextPreview({ layout, zones, palette, pairing, values, adjust, onAdjust, accent }: {
  layout: Layout; zones: TextZone[]; palette: ColorVariant | null; pairing: FontPairing | null; values: Record<string, string>;
  adjust: Record<string, TextAdjust>; onAdjust: (a: Record<string, TextAdjust>) => void; accent: string;
}) {
  const look: TextLook = useMemo(() => ({ colors: palette?.colors ?? DEFAULT_TEXT_COLORS, pairing, adjust }), [palette, pairing, adjust]);
  const words = useMemo(() => {
    const out = sampleValues(zones);
    for (const [k, v] of Object.entries(values)) if (v?.trim()) out[k] = v;
    return out;
  }, [zones, values]);
  const width = Math.round(Math.min(320, 320 * layout.widthPx / layout.heightPx));
  const shown = palette ? { ...layout, backgroundColor: palette.colors.background } : layout;
  const boxes = layout.texts ?? [];
  const set = (id: string, patch: TextAdjust) => onAdjust({ ...adjust, [id]: { ...adjust[id], ...patch } });

  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="relative">
          <LayoutPreview layout={shown} width={width}/>
          <TextLayerCanvas layout={layout} values={words} look={look} width={width}/>
        </div>
      </div>
      <div className="space-y-2">
        {boxes.map(b => {
          const a = adjust[b.id] ?? {};
          const outline = a.outline ?? b.outline.enabled, shadow = a.shadow ?? b.shadow.enabled;
          const step = nearestStep(a.scale ?? 1);
          const chip = (on: boolean) => `px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${on ? 'text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`;
          return (
            <div key={b.id} className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-gray-200">
              <span className="text-sm font-medium text-gray-800 mr-auto">{zones.find(z => z.id === b.zoneId)?.label ?? 'Text'}</span>
              <button type="button" onClick={() => set(b.id, { outline: !outline })} className={chip(outline)} style={outline ? { background: accent, borderColor: accent } : undefined} aria-pressed={outline}>Outline {outline ? 'on' : 'off'}</button>
              <button type="button" onClick={() => set(b.id, { shadow: !shadow })} className={chip(shadow)} style={shadow ? { background: accent, borderColor: accent } : undefined} aria-pressed={shadow}>Shadow {shadow ? 'on' : 'off'}</button>
              <div className="flex items-center rounded-lg border border-gray-200">
                <button type="button" disabled={step === 0} onClick={() => set(b.id, { scale: TEXT_SCALE_STEPS[step - 1] })} className="p-1.5 text-gray-600 disabled:opacity-30" aria-label="Smaller"><Minus className="w-3.5 h-3.5"/></button>
                <span className="text-xs text-gray-600 w-11 text-center">{Math.round(TEXT_SCALE_STEPS[step] * 100)}%</span>
                <button type="button" disabled={step === TEXT_SCALE_STEPS.length - 1} onClick={() => set(b.id, { scale: TEXT_SCALE_STEPS[step + 1] })} className="p-1.5 text-gray-600 disabled:opacity-30" aria-label="Bigger"><Plus className="w-3.5 h-3.5"/></button>
              </div>
            </div>
          );
        })}
        <p className="text-xs text-gray-400">Long words shrink to fit their space. Make them bigger or smaller here if you like.</p>
      </div>
    </div>
  );
}
