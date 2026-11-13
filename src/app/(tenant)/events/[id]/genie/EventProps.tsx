'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDown, ArrowUp, Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Toggle } from '@/components/genie/parts';
import { PROPS_RECOMMENDED_MAX, PropBrowser, PropOnFace, PropThumb, type Category, type Prop } from '@/components/genie/Props';

export type EventPropsValue = { enabled: boolean; propIds: string[] };

// Event → Genie → Props: on/off and the props guests pick from, in their order
export function EventPropsFields({ value, chosen, disabled, onChange }: { value: EventPropsValue; chosen: Prop[]; disabled?: boolean; onChange: (v: Partial<EventPropsValue>) => void }) {
  const [library, setLibrary] = useState<{ categories: Category[]; props: Prop[] } | null>(null);
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!value.enabled || library) return;
    fetch('/api/genie-props').then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Could not load your props'); return; }
      setLibrary({ categories: d.categories, props: [...d.mine, ...d.standard] });
    });
  }, [value.enabled, library]);

  // Details for each chosen id: the event's own list (includes props switched off since) plus the library
  const byId = useMemo(() => {
    const m = new Map<string, Prop>();
    for (const p of library?.props ?? []) m.set(p.id, p);
    for (const p of chosen) m.set(p.id, p);
    return m;
  }, [library, chosen]);
  const ids = value.propIds;
  const move = (i: number, d: number) => { const l = [...ids]; [l[i], l[i + d]] = [l[i + d], l[i]]; onChange({ propIds: l }); };
  const toggle = (id: string) => onChange({ propIds: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] });

  return (
    <div className="space-y-4">
      <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label="Offer props to guests"
        hint="After picking a design, guests choose one prop (or none). It follows every face and is drawn into the photos, not Boomerangs."/>
      {value.enabled && (
        <>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-600 flex-1">
              <span className="font-medium">{ids.length} {ids.length === 1 ? 'prop' : 'props'}</span> chosen. Guests see them in this order.
              {ids.length === 0 && ' Until you choose some, the iPad shows no prop picker.'}
            </p>
            <Button variant="outline" size="sm" disabled={disabled || !library} onClick={() => setPicking(true)}><Plus className="w-3.5 h-3.5 mr-1"/>Choose Props</Button>
          </div>
          {ids.length > PROPS_RECOMMENDED_MAX && (
            <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0"/>
              <span>About {PROPS_RECOMMENDED_MAX} or fewer works best. With more, guests take longer to choose and the line backs up.</span>
            </div>
          )}
          {ids.length > 0 && (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
              {ids.map((id, i) => {
                const p = byId.get(id);
                return (
                  <div key={id} className="flex items-center gap-3 px-3 py-2">
                    <span className="text-xs text-gray-400 w-5 text-right">{i + 1}</span>
                    <div className="w-24 h-16 bg-gray-50 rounded flex-shrink-0">{p && <PropOnFace prop={p} className="w-full h-full"/>}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p?.name ?? 'Prop no longer in your library'}</p>
                      <div className="flex flex-wrap gap-1.5 mt-0.5">
                        {p && <Badge variant="default">{p.source === 'account' ? 'My prop' : 'Standard'}</Badge>}
                        {p && !p.isActive && <Badge variant="warning">No longer offered: stays on this event until you remove it</Badge>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="w-4 h-4"/></Button>
                    <Button variant="ghost" size="icon" disabled={disabled || i === ids.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="w-4 h-4"/></Button>
                    <Button variant="ghost" size="icon" disabled={disabled} onClick={() => toggle(id)} aria-label="Remove"><X className="w-4 h-4"/></Button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-gray-400">Add your own in <Link href="/genie/props" className="text-brand hover:underline">Genie → Props</Link>.</p>
        </>
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title="Choose Props" className="max-w-4xl">
        {library && (
          <div className="space-y-4">
            <p className={'text-sm ' + (ids.length > PROPS_RECOMMENDED_MAX ? 'text-amber-700' : 'text-gray-500')}>
              {ids.length} chosen{ids.length > PROPS_RECOMMENDED_MAX ? ` · about ${PROPS_RECOMMENDED_MAX} or fewer keeps the line moving` : ''}. New picks go to the end of the list.
            </p>
            <PropBrowser props={library.props} categories={library.categories} empty="No props in your library yet." renderCard={p => {
              const on = ids.includes(p.id);
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)}
                  className={'relative text-left rounded-xl border p-2 transition-colors ' + (on ? 'border-brand ring-2 ring-brand/30 bg-blue-50/40' : 'border-gray-200 hover:border-gray-300')}>
                  {on && <span className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center"><Check className="w-3 h-3"/></span>}
                  <PropThumb prop={p} className="w-full h-16"/>
                  <p className="text-xs font-medium mt-1.5 leading-tight">{p.name}</p>
                  <p className="text-[10px] text-gray-400">{p.source === 'account' ? 'My prop' : 'Standard'}</p>
                </button>
              );
            }}/>
            <div className="flex justify-end"><Button onClick={() => setPicking(false)}>Done</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
