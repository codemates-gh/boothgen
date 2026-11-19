'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { AlertTriangle, Type } from 'lucide-react';
import { Field, LayoutPreview, type Layout } from '@/components/genie/parts';
import { TextLayerCanvas } from '@/components/genie/TextLayerCanvas';
import { DEFAULT_TEXT_COLORS, type TextAdjust, type TextLook } from '@/lib/templates/textLayer';
import type { ColorVariant, FontPairing } from '@/lib/templates/clientOptions';

// Event → Genie → Template Text: the words drawn on the event's templates (names, date…), one set for the whole event,
// and each template's palette and fonts. The client's design brief fills them in; the operator can type them here.

type FieldRow = { key: string; label: string; required: boolean; maxChars: number; placeholder: string; value: string; briefValue: string | null; typed: boolean };
type TemplateRow = {
  id: string; name: string; layout: Layout; alternateLayout: Layout | null; colorVariants: ColorVariant[]; fontPairings: FontPairing[];
  paletteId: string | null; pairingId: string | null; adjust: Record<string, TextAdjust>; values: Record<string, string>;
  boomerang?: boolean; // the Boomerang's template: palette and fonts follow the client's brief
};
type Data = { fields: FieldRow[]; templates: TemplateRow[]; hasBrief: boolean };

function Preview({ t, layout }: { t: TemplateRow; layout: Layout }) {
  const palette = t.colorVariants.find(p => p.id === t.paletteId) ?? null;
  const look: TextLook = useMemo(() => ({ colors: palette?.colors ?? DEFAULT_TEXT_COLORS, pairing: t.fontPairings.find(p => p.id === t.pairingId) ?? null, adjust: t.adjust }), [palette, t]);
  const width = layout.widthPx >= layout.heightPx ? 150 : 100;
  const shown = layout.texts?.length && palette ? { ...layout, backgroundColor: palette.colors.background } : layout;
  return (
    <div className="relative flex-shrink-0">
      <LayoutPreview layout={shown} width={width}/>
      <TextLayerCanvas layout={layout} values={t.values} look={look} width={width}/>
    </div>
  );
}

export default function GenieTemplateText({ eventId, locked, version, onChange }: { eventId: string; locked: boolean; version: string; onChange: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/${eventId}/genie/template-text`);
    if (!r.ok) return;
    const d: Data = await r.json();
    setData(d);
    setDraft(Object.fromEntries(d.fields.map(f => [f.key, f.value])));
  }, [eventId]);
  // Reloads when the event's templates change
  useEffect(() => { load(); }, [load, version]);

  async function put(body: object) {
    setBusy(true); setError(''); setSaved(false);
    const r = await fetch(`/api/events/${eventId}/genie/template-text`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(d.error || 'Could not save'); return false; }
    setData(d); setDraft(Object.fromEntries((d as Data).fields.map(f => [f.key, f.value])));
    onChange();
    return true;
  }

  if (!data || data.templates.length === 0) return null;
  const dirty = data.fields.some(f => (draft[f.key] ?? '') !== f.value);
  const missing = data.fields.filter(f => !f.value.trim());

  async function saveWords() {
    if (!data) return;
    const answers: Record<string, string | null> = {};
    for (const f of data.fields) {
      const v = draft[f.key] ?? '';
      if (v === f.value) continue;
      // Back to the client's words: follow the brief again
      answers[f.key] = f.briefValue !== null && v === f.briefValue ? null : v;
    }
    if (await put({ answers })) setSaved(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Type className="w-4 h-4"/>Template Text</CardTitle>
        <p className="text-sm text-gray-500">The words drawn on this event&apos;s templates. {data.hasBrief ? 'They come from the client’s design brief; change them here if needed.' : 'Type them here, or the client fills them in with their design brief.'}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {missing.length > 0 && (
          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/>
            <span>Not filled in yet: {missing.map(f => f.label).join(', ')}. iPads leave this text off the photos until it&apos;s filled in.</span>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.fields.map(f => (
            <Field key={f.key} label={f.label + (f.required ? '' : ' (optional)')}
              hint={f.typed ? (f.briefValue !== null ? `Changed here. The client wrote “${f.briefValue}”.` : 'Typed here.') : f.briefValue !== null ? 'From the client’s design brief.' : undefined}>
              <Input value={draft[f.key] ?? ''} maxLength={f.maxChars} disabled={locked || busy} placeholder={f.placeholder} onChange={e => { setSaved(false); setDraft(d => ({ ...d, [f.key]: e.target.value })); }}/>
            </Field>
          ))}
        </div>
        {!locked && (
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={!dirty || busy} onClick={saveWords}>{busy ? 'Saving…' : 'Save Text'}</Button>
            {saved && !dirty && <span className="text-sm text-green-700">Saved. iPads get it on their next sync.</span>}
          </div>
        )}

        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {data.templates.map(t => (
            <li key={t.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3">
              <div className="flex items-center gap-2">
                <Preview t={t} layout={t.layout}/>
                {t.alternateLayout?.texts?.length ? <Preview t={t} layout={t.alternateLayout}/> : null}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm font-medium truncate">{t.name}</p>
                {t.boomerang ? <p className="text-xs text-gray-500">Palette and fonts follow the client’s design brief{t.colorVariants.length ? ` (${t.colorVariants.find(p => p.id === t.paletteId)?.name ?? ''})` : ''}.</p> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {t.colorVariants.length > 1 && (
                    <Field label="Palette">
                      <Select value={t.paletteId ?? ''} disabled={locked || busy} onChange={e => put({ templates: [{ id: t.id, paletteId: e.target.value }] })}>
                        {t.colorVariants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    </Field>
                  )}
                  {t.fontPairings.length > 1 && (
                    <Field label="Fonts">
                      <Select value={t.pairingId ?? ''} disabled={locked || busy} onChange={e => put({ templates: [{ id: t.id, pairingId: e.target.value }] })}>
                        {t.fontPairings.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    </Field>
                  )}
                </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
