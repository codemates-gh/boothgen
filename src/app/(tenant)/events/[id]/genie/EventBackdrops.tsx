'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Check, Lightbulb, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Field, Toggle } from '@/components/genie/parts';
import { BackdropThumb, BackdropUploadButton, type Backdrop } from '@/components/genie/Backdrops';

export type EventBackdropsValue = { enabled: boolean; backdropIds: string[]; defaultId: string | null; guestPicks: boolean; edgeSoftness: 'soft' | 'medium' | 'sharp' };

// Event → Genie → Virtual backdrop: on/off, the backdrops (guests' order), the default, guest choice and edge softness
export function EventBackdropsFields({ value, chosen, disabled, onChange }: { value: EventBackdropsValue; chosen: Backdrop[]; disabled?: boolean; onChange: (v: Partial<EventBackdropsValue>) => void }) {
  const [library, setLibrary] = useState<Backdrop[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [picking, setPicking] = useState(false);

  async function loadLibrary() {
    const r = await fetch('/api/genie-backdrops');
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load your backdrops'); return; }
    setLibrary([...d.mine, ...d.standard]);
  }
  useEffect(() => { if (value.enabled && !library) loadLibrary(); }, [value.enabled, library]);

  const byId = useMemo(() => {
    const m = new Map<string, Backdrop>();
    for (const b of library ?? []) m.set(b.id, b);
    for (const b of chosen) m.set(b.id, b);
    return m;
  }, [library, chosen]);
  const ids = value.backdropIds;
  const defaultId = value.defaultId && ids.includes(value.defaultId) ? value.defaultId : ids[0] ?? null;
  const move = (i: number, d: number) => { const l = [...ids]; [l[i], l[i + d]] = [l[i + d], l[i]]; onChange({ backdropIds: l }); };
  const toggle = (id: string) => {
    const next = ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
    onChange({ backdropIds: next, defaultId: value.defaultId && next.includes(value.defaultId) ? value.defaultId : null });
  };

  return (
    <div className="space-y-4">
      <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label="Remove the background"
        hint="The iPad cuts guests out of the real background and puts them on a backdrop, in every photo (not Boomerangs). It runs on the iPad, so it works offline."/>
      {value.enabled && (
        <>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-gray-600 flex-1">
              <span className="font-medium">{ids.length} {ids.length === 1 ? 'backdrop' : 'backdrops'}</span> chosen.
              {ids.length === 0 ? ' Until you choose one, the real background is kept.' : ' Guests see them in this order.'}
            </p>
            <BackdropUploadButton scope="mine" variant="outline" size="sm" label="Upload" disabled={disabled}
              onDone={(b, w) => { setNotice(w ?? ''); setLibrary(l => l ? [b, ...l] : l); onChange({ backdropIds: [...ids, b.id] }); }}/>
            <Button variant="outline" size="sm" disabled={disabled || !library} onClick={() => setPicking(true)}><Plus className="w-3.5 h-3.5 mr-1"/>Choose Backdrops</Button>
          </div>
          {notice && <p className="text-sm text-amber-700">{notice}</p>}
          {ids.length > 0 && (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
              {ids.map((id, i) => {
                const b = byId.get(id);
                return (
                  <div key={id} className="flex items-center gap-3 px-3 py-2">
                    <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
                    <div className="w-24 flex-shrink-0">{b && <BackdropThumb backdrop={b}/>}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{b?.name ?? 'Backdrop no longer in your library'}</p>
                      <div className="flex flex-wrap gap-1.5 mt-0.5">
                        {b && <Badge variant="default">{b.source === 'account' ? 'My backdrop' : 'Standard'}</Badge>}
                        {b && !b.isActive && <Badge variant="warning">No longer offered: stays on this event until you remove it</Badge>}
                      </div>
                    </div>
                    <label className={'flex items-center gap-1.5 text-xs ' + (disabled ? 'text-gray-300' : 'text-gray-600 cursor-pointer')}>
                      <input type="radio" name="backdropDefault" checked={defaultId === id} disabled={disabled} onChange={() => onChange({ defaultId: id })}/>
                      Default
                    </label>
                    <Button variant="ghost" size="icon" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="w-4 h-4"/></Button>
                    <Button variant="ghost" size="icon" disabled={disabled || i === ids.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="w-4 h-4"/></Button>
                    <Button variant="ghost" size="icon" disabled={disabled} onClick={() => toggle(id)} aria-label="Remove"><X className="w-4 h-4"/></Button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Toggle checked={value.guestPicks} disabled={disabled} onChange={v => onChange({ guestPicks: v })} label="Guests choose their backdrop"
              hint={ids.length < 2 ? 'Only matters with 2 or more backdrops.' : 'Off: every session uses the default backdrop.'}/>
            <Field label="Edge softness" hint="Soft blends hair and edges more; Sharp gives crisper outlines.">
              <Select value={value.edgeSoftness} disabled={disabled} onChange={e => onChange({ edgeSoftness: e.target.value as EventBackdropsValue['edgeSoftness'] })}>
                <option value="soft">Soft</option>
                <option value="medium">Medium</option>
                <option value="sharp">Sharp</option>
              </Select>
            </Field>
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
            <Lightbulb className="w-3.5 h-3.5 mt-0.5 flex-shrink-0"/>
            <span>Works best with good, even light, guests standing clearly in front of the real background, and nothing green or busy behind them. The iPad crops each backdrop to fill each photo, centred.</span>
          </div>
          <p className="text-xs text-gray-400">Manage your own in <Link href="/genie/backdrops" className="text-brand hover:underline">Genie → Backdrops</Link>.</p>
        </>
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title="Choose Backdrops" className="max-w-3xl">
        {library && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{ids.length} chosen. New picks go to the end of the list.</p>
            {library.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">No backdrops in your library yet. Upload one.</p> : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {library.map(b => {
                  const on = ids.includes(b.id);
                  return (
                    <button key={b.id} type="button" onClick={() => toggle(b.id)}
                      className={'relative text-left rounded-xl border p-2 transition-colors ' + (on ? 'border-brand ring-2 ring-brand/30 bg-blue-50/40' : 'border-gray-200 hover:border-gray-300')}>
                      {on && <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center"><Check className="w-3 h-3"/></span>}
                      <BackdropThumb backdrop={b}/>
                      <p className="text-xs font-medium mt-1.5 leading-tight">{b.name}</p>
                      <p className="text-[10px] text-gray-400">{b.source === 'account' ? 'My backdrop' : 'Standard'}</p>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end"><Button onClick={() => setPicking(false)}>Done</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
