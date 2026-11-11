'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, X } from 'lucide-react';
import { Field, Toggle } from './parts';
import { FONT_OPTIONS, type ColorVariant, type FontPairing, type TextZone } from '@/lib/templates/clientOptions';

// What clients see and customize when they pick this layout in their design brief (portal → Design)
export type ClientOpts = {
  description: string;
  textZones: TextZone[];
  colorVariants: ColorVariant[];
  fontPairings: FontPairing[];
  visible: boolean; // Standard: published; My templates: offered to this account's clients
};

export const EMPTY_CLIENT_OPTS: ClientOpts = { description: '', textZones: [], colorVariants: [], fontPairings: [], visible: false };

const rid = () => Math.random().toString(36).slice(2, 10);
const DEFAULT_FONT = FONT_OPTIONS.find(f => f.id === 'montserrat')!;

export function ClientOptionsCard({ value, onChange, scope, readOnly }: { value: ClientOpts; onChange: (v: ClientOpts) => void; scope: 'mine' | 'standard'; readOnly?: boolean }) {
  const set = (patch: Partial<ClientOpts>) => onChange({ ...value, ...patch });

  // Font pairings carry one font per text field
  function setZones(zones: TextZone[]) {
    set({
      textZones: zones,
      fontPairings: value.fontPairings.map(p => ({
        ...p,
        fonts: zones.map(z => {
          const f = p.fonts.find(x => x.zoneId === z.id);
          const font = FONT_OPTIONS.find(o => o.id === f?.fontId) ?? DEFAULT_FONT;
          return { zoneId: z.id, fontId: font.id, label: z.label, fontFamily: font.fontFamily };
        }),
      })),
    });
  }
  const zone = (i: number, patch: Partial<TextZone>) => setZones(value.textZones.map((z, j) => j === i ? { ...z, ...patch } : z));
  const variant = (i: number, patch: Partial<ColorVariant>) => set({ colorVariants: value.colorVariants.map((v, j) => j === i ? { ...v, ...patch } : v) });
  const pairing = (i: number, patch: Partial<FontPairing>) => set({ fontPairings: value.fontPairings.map((p, j) => j === i ? { ...p, ...patch } : p) });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Client Options</CardTitle>
        <p className="text-xs text-gray-500">What clients see and choose when they pick this layout in their design brief.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Toggle checked={value.visible} disabled={readOnly} onChange={v => set({ visible: v })}
          label={scope === 'standard' ? 'Published' : 'Offer to my clients'}
          hint={scope === 'standard' ? "Shows in every operator's Standard templates and their clients' design picker. Operators can hide it." : "Shows in your clients' design picker (portal → Design)."}/>

        <Field label="Description" hint="Shown to clients under the layout name.">
          <Textarea rows={2} maxLength={300} value={value.description} disabled={readOnly} onChange={e => set({ description: e.target.value })} placeholder="Three photos side by side with room for your names and date"/>
        </Field>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Text fields</p>
            {!readOnly && <Button variant="ghost" size="sm" disabled={value.textZones.length >= 10} onClick={() => setZones([...value.textZones, { id: rid(), label: '', placeholder: '', maxChars: 40, required: true }])}><Plus className="w-3.5 h-3.5 mr-1"/>Add</Button>}
          </div>
          {value.textZones.length === 0 && <p className="text-xs text-gray-400">None. Add fields like names or the event date for clients to fill in.</p>}
          {value.textZones.map((z, i) => (
            <div key={z.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex gap-2">
                <Input value={z.label} disabled={readOnly} maxLength={60} onChange={e => zone(i, { label: e.target.value })} placeholder="Label, e.g. Names"/>
                {!readOnly && <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setZones(value.textZones.filter((_, j) => j !== i))} aria-label="Remove"><X className="w-4 h-4"/></Button>}
              </div>
              <div className="grid grid-cols-[1fr_88px] gap-2">
                <Input value={z.placeholder} disabled={readOnly} maxLength={120} onChange={e => zone(i, { placeholder: e.target.value })} placeholder="Example, e.g. Ana & Ben"/>
                <Input type="number" min={1} max={500} value={z.maxChars} disabled={readOnly} onChange={e => zone(i, { maxChars: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })} title="Max characters"/>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={z.required} disabled={readOnly} onChange={e => zone(i, { required: e.target.checked })}/> Required · up to {z.maxChars} characters
              </label>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Color palettes</p>
            {!readOnly && <Button variant="ghost" size="sm" disabled={value.colorVariants.length >= 12} onClick={() => set({ colorVariants: [...value.colorVariants, { id: rid(), name: '', colors: { background: '#FFFFFF', text: '#1F1F3D', accent: '#D4AF37' } }] })}><Plus className="w-3.5 h-3.5 mr-1"/>Add</Button>}
          </div>
          {value.colorVariants.length === 0 && <p className="text-xs text-gray-400">None.</p>}
          {value.colorVariants.map((v, i) => (
            <div key={v.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex gap-2">
                <Input value={v.name} disabled={readOnly} maxLength={60} onChange={e => variant(i, { name: e.target.value })} placeholder="Name, e.g. Blush Rose"/>
                {!readOnly && <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => set({ colorVariants: value.colorVariants.filter((_, j) => j !== i) })} aria-label="Remove"><X className="w-4 h-4"/></Button>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['background', 'text', 'accent'] as const).map(k => (
                  <label key={k} className="flex flex-col items-center gap-1 text-xs text-gray-500 capitalize">
                    {k}
                    <input type="color" value={v.colors[k]} disabled={readOnly} onChange={e => variant(i, { colors: { ...v.colors, [k]: e.target.value.toUpperCase() } })} className="w-10 h-8 rounded border border-gray-200 cursor-pointer"/>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">Font pairings</p>
            {!readOnly && <Button variant="ghost" size="sm" disabled={value.textZones.length === 0 || value.fontPairings.length >= 12} onClick={() => set({ fontPairings: [...value.fontPairings, { id: rid(), name: '', fonts: value.textZones.map(z => ({ zoneId: z.id, fontId: DEFAULT_FONT.id, label: z.label, fontFamily: DEFAULT_FONT.fontFamily })) }] })}><Plus className="w-3.5 h-3.5 mr-1"/>Add</Button>}
          </div>
          {value.textZones.length === 0 ? <p className="text-xs text-gray-400">Add a text field first.</p> : value.fontPairings.length === 0 && <p className="text-xs text-gray-400">None.</p>}
          {value.fontPairings.map((p, i) => (
            <div key={p.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex gap-2">
                <Input value={p.name} disabled={readOnly} maxLength={60} onChange={e => pairing(i, { name: e.target.value })} placeholder="Name, e.g. Elegant Script"/>
                {!readOnly && <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => set({ fontPairings: value.fontPairings.filter((_, j) => j !== i) })} aria-label="Remove"><X className="w-4 h-4"/></Button>}
              </div>
              {p.fonts.map((f, fi) => (
                <div key={f.zoneId} className="grid grid-cols-[80px_1fr] items-center gap-2">
                  <span className="text-xs text-gray-500 truncate" title={f.label}>{f.label || 'Text'}</span>
                  <Select value={f.fontId} disabled={readOnly} onChange={e => {
                    const font = FONT_OPTIONS.find(o => o.id === e.target.value) ?? DEFAULT_FONT;
                    pairing(i, { fonts: p.fonts.map((x, j) => j === fi ? { ...x, fontId: font.id, fontFamily: font.fontFamily } : x) });
                  }}>
                    {FONT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </Select>
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Fields with gaps (a label or name left empty) can't be saved
export function clientOptsProblem(v: ClientOpts): string | null {
  if (v.textZones.some(z => !z.label.trim())) return 'Give every text field a label (Client Options).';
  if (v.colorVariants.some(c => !c.name.trim())) return 'Give every color palette a name (Client Options).';
  if (v.fontPairings.some(p => !p.name.trim())) return 'Give every font pairing a name (Client Options).';
  return null;
}
