'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AlignCenter, AlignLeft, AlignRight, Plus, Trash2 } from 'lucide-react';
import { Field, Toggle } from './parts';
import { FONT_OPTIONS, type ColorVariant, type FontPairing, type TextZone } from '@/lib/templates/clientOptions';
import { SHADOW_PRESETS, boxFontId, resolveColor, type ColorRef, type Colors, type TextBox } from '@/lib/templates/textLayer';

// Template Designer → Text: boxes that show the client's words (the template's Text fields) on the layout

function ColorPick({ value, colors, hasPalettes, onChange }: { value: ColorRef; colors: Colors; hasPalettes: boolean; onChange: (v: ColorRef) => void }) {
  const role = value === 'text' || value === 'accent' || value === 'background' ? value : 'custom';
  const names = { text: 'Text', accent: 'Accent', background: 'Background' } as const;
  return (
    <div className="flex gap-2">
      <Select value={role} onChange={e => onChange(e.target.value === 'custom' ? resolveColor(value, colors).toUpperCase() : e.target.value as ColorRef)} className="flex-1">
        {(['text', 'accent', 'background'] as const).map(r => <option key={r} value={r}>{hasPalettes ? `Palette ${names[r].toLowerCase()} colour` : `${names[r]} (${colors[r]})`}</option>)}
        <option value="custom">Fixed colour</option>
      </Select>
      <input type="color" value={resolveColor(value, colors)} onChange={e => onChange(e.target.value.toUpperCase())} className="h-10 w-12 rounded border border-gray-300 cursor-pointer flex-shrink-0" title="Pick a fixed colour"/>
    </div>
  );
}

const num = (v: string, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number(v) || 0));

export function TextBoxPanel({ zones, palettes, pairings, boxes, selected, colors, previewPaletteId, previewPairingId, onPreviewPalette, onPreviewPairing, onAdd, onChange, onRemove }: {
  zones: TextZone[]; palettes: ColorVariant[]; pairings: FontPairing[]; boxes: TextBox[]; selected: TextBox | null; colors: Colors;
  previewPaletteId: string | null; previewPairingId: string | null; onPreviewPalette: (id: string) => void; onPreviewPairing: (id: string) => void;
  onAdd: (zoneId: string) => void; onChange: (patch: Partial<TextBox>) => void; onRemove: () => void;
}) {
  const b = selected;
  const zoneLabel = (id: string) => zones.find(z => z.id === id)?.label ?? 'Removed field';
  const unused = zones.filter(z => !boxes.some(x => x.zoneId === z.id));
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Text</CardTitle>
          <Button variant="outline" size="sm" disabled={zones.length === 0 || boxes.length >= 10} onClick={() => onAdd((unused[0] ?? zones[0]).id)}><Plus className="w-3.5 h-3.5 mr-1"/>Add</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {zones.length === 0 ? (
          <p className="text-sm text-gray-500">Add a text field under Client Options (for example Names or Date), then add a box here to show it on the layout.</p>
        ) : !b ? (
          <p className="text-sm text-gray-500">{boxes.length ? 'Select a text box to edit it.' : 'Add a box to show the client’s words on the layout. Samples show until the client fills them in.'}</p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Field label="Shows">
                  <Select value={b.zoneId} onChange={e => onChange({ zoneId: e.target.value })}>
                    {!zones.some(z => z.id === b.zoneId) && <option value={b.zoneId}>Removed field</option>}
                    {zones.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                  </Select>
                </Field>
              </div>
              <Button variant="outline" size="sm" className="text-[#E2445C] h-10" onClick={onRemove} title="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
            </div>
            <div className="flex gap-1">
              {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, Icon]) => (
                <Button key={a} variant={b.align === a ? 'default' : 'outline'} size="sm" onClick={() => onChange({ align: a })} title={`Align ${a}`}><Icon className="w-3.5 h-3.5"/></Button>
              ))}
            </div>
            {pairings.length === 0 ? (
              <Field label="Font">
                <Select value={boxFontId(b, null)} onChange={e => onChange({ fontId: e.target.value })}>
                  {FONT_OPTIONS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                </Select>
              </Field>
            ) : <p className="text-xs text-gray-500">Font: from the client’s font pairing ({FONT_OPTIONS.find(f => f.id === boxFontId(b, pairings.find(p => p.id === previewPairingId) ?? pairings[0]))?.label} in the preview).</p>}
            <Field label="Colour"><ColorPick value={b.color} colors={colors} hasPalettes={palettes.length > 0} onChange={color => onChange({ color })}/></Field>
            <Field label="Largest size (px)" hint="Longer words shrink to fit the box.">
              <Input type="number" value={b.maxFontPx} onChange={e => onChange({ maxFontPx: num(e.target.value, 8, 1000) })}/>
            </Field>

            <div className="pt-2 border-t border-gray-100 space-y-3">
              <Toggle checked={b.outline.enabled} onChange={enabled => onChange({ outline: { ...b.outline, enabled } })} label="Outline" hint="A line around the letters. Clients can turn it off."/>
              {b.outline.enabled && (
                <div className="grid grid-cols-[1fr_88px] gap-2">
                  <Field label="Colour"><ColorPick value={b.outline.color} colors={colors} hasPalettes={palettes.length > 0} onChange={color => onChange({ outline: { ...b.outline, color } })}/></Field>
                  <Field label="Thickness"><Input type="number" value={b.outline.widthPx} onChange={e => onChange({ outline: { ...b.outline, widthPx: num(e.target.value, 0, 60) } })}/></Field>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-gray-100 space-y-3">
              <Toggle checked={b.shadow.enabled} onChange={enabled => onChange({ shadow: { ...b.shadow, enabled } })} label="Drop shadow" hint="Keeps text readable over photos. Clients can turn it off."/>
              {b.shadow.enabled && (
                <>
                  <div className="flex gap-1">
                    {(Object.keys(SHADOW_PRESETS) as (keyof typeof SHADOW_PRESETS)[]).map(k => (
                      <Button key={k} variant="outline" size="sm" className="capitalize" onClick={() => onChange({ shadow: { enabled: true, ...SHADOW_PRESETS[k] } })}>{k}</Button>
                    ))}
                  </div>
                  <Field label="Colour"><ColorPick value={b.shadow.color} colors={colors} hasPalettes={palettes.length > 0} onChange={color => onChange({ shadow: { ...b.shadow, color } })}/></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Strength %"><Input type="number" value={Math.round(b.shadow.opacity * 100)} onChange={e => onChange({ shadow: { ...b.shadow, opacity: num(e.target.value, 0, 100) / 100 } })}/></Field>
                    <Field label="Softness"><Input type="number" value={b.shadow.blurPx} onChange={e => onChange({ shadow: { ...b.shadow, blurPx: num(e.target.value, 0, 100) } })}/></Field>
                    <Field label="Distance"><Input type="number" value={b.shadow.distancePx} onChange={e => onChange({ shadow: { ...b.shadow, distancePx: num(e.target.value, 0, 100) } })}/></Field>
                    <Field label="Direction °"><Input type="number" value={b.shadow.angleDegrees} onChange={e => onChange({ shadow: { ...b.shadow, angleDegrees: num(e.target.value, -180, 180) } })}/></Field>
                  </div>
                </>
              )}
            </div>

            <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-3">
              {([['x', 'X'], ['y', 'Y'], ['width', 'Width'], ['height', 'Height'], ['rotationDegrees', 'Rotation °']] as const).map(([k, label]) => (
                <Field key={k} label={label}><Input type="number" value={b[k]} onChange={e => onChange({ [k]: Number(e.target.value) || 0 } as Partial<TextBox>)}/></Field>
              ))}
            </div>
          </>
        )}

        {zones.length > 0 && boxes.length > 0 && (palettes.length > 1 || pairings.length > 1) && (
          <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
            {palettes.length > 1 && (
              <Field label="Preview palette">
                <Select value={previewPaletteId ?? ''} onChange={e => onPreviewPalette(e.target.value)}>{palettes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
              </Field>
            )}
            {pairings.length > 1 && (
              <Field label="Preview fonts">
                <Select value={previewPairingId ?? ''} onChange={e => onPreviewPairing(e.target.value)}>{pairings.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
              </Field>
            )}
          </div>
        )}
        {b && <p className="text-xs text-gray-400">Box: {zoneLabel(b.zoneId)}. Samples (the field’s example text) show here; iPads show the client’s words, and leave the box out until they’re filled in.</p>}
      </CardContent>
    </Card>
  );
}
