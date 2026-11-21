'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Toggle } from './parts';
import { POSES_PER_CATEGORY_HINT, POSE_CATEGORIES, PoseThumb, PoseUploadButton, categoryLabel, type Pose, type PoseCategory } from './Poses';

export type PoseIdeasValue = { enabled: boolean; poseIds: string[] };

// "Pose ideas" (account Event defaults, or an event's own): on/off and the poses guests see, per category, in order
export function PoseIdeasFields({ value, chosen, disabled, onChange, bare }: { value: PoseIdeasValue; chosen: Pose[]; disabled?: boolean; onChange: (v: Partial<PoseIdeasValue>) => void; bare?: boolean }) {
  const [library, setLibrary] = useState<Pose[] | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<PoseCategory>('her');
  const [picking, setPicking] = useState(false);

  async function loadLibrary() {
    const r = await fetch('/api/genie-poses');
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load your poses'); return; }
    setLibrary([...d.mine, ...d.standard]);
  }
  useEffect(() => { if (value.enabled && !library) loadLibrary(); }, [value.enabled, library]);

  const byId = useMemo(() => {
    const m = new Map<string, Pose>();
    for (const p of chosen) m.set(p.id, p);
    for (const p of library ?? []) m.set(p.id, p);
    return m;
  }, [library, chosen]);
  const ids = value.poseIds;
  const count = (c: PoseCategory) => ids.filter(id => byId.get(id)?.category === c).length;
  const inTab = ids.filter(id => byId.get(id)?.category === tab);
  const libraryInTab = (library ?? []).filter(p => p.category === tab);

  // Moves within the category: swaps the two poses' places in the whole list
  const move = (id: string, d: number) => {
    const i = inTab.indexOf(id), j = i + d;
    if (j < 0 || j >= inTab.length) return;
    const a = ids.indexOf(inTab[i]), b = ids.indexOf(inTab[j]);
    const l = [...ids]; [l[a], l[b]] = [l[b], l[a]];
    onChange({ poseIds: l });
  };
  const toggle = (id: string) => onChange({ poseIds: ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id] });
  const allOn = libraryInTab.length > 0 && libraryInTab.every(p => ids.includes(p.id));
  const selectAll = () => onChange({ poseIds: allOn ? ids.filter(id => !libraryInTab.some(p => p.id === id)) : [...ids, ...libraryInTab.map(p => p.id).filter(id => !ids.includes(id))] });

  return (
    <div className="space-y-4">
      {!bare && <Toggle checked={value.enabled} disabled={disabled} onChange={v => onChange({ enabled: v })} label="Show pose ideas"
        hint="Before Start, guests choose Solo (Her, Him or All) or Group (For two or For groups) and see sample poses; during each countdown a card shows one. Photos only, never Boomerangs, and the poses are never in the photos."/>}
      {value.enabled && (
        <>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-sm text-gray-600">
            <span className="font-medium">{ids.length} {ids.length === 1 ? 'pose' : 'poses'}</span> chosen.
            {ids.length === 0 ? " Until you choose some, guests don't see pose ideas." : ' Guests see them in this order within each category.'}
          </p>
          <div className="flex flex-wrap gap-1 border-b border-gray-200">
            {POSE_CATEGORIES.map(c => (
              <button key={c.value} type="button" onClick={() => setTab(c.value)}
                className={'px-3 py-2 text-sm font-medium border-b-2 -mb-px ' + (tab === c.value ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                {c.label} <span className="text-xs opacity-70">{count(c.value)}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs text-gray-500 flex-1 min-w-[200px]">
              {tab === 'all' ? 'All shows these plus every Her and Him pose.' : tab === 'two' ? 'Shown when guests choose Group.' : tab === 'groups' ? 'Shown when guests choose Group.' : 'Also shown under All.'}
              {inTab.length > POSES_PER_CATEGORY_HINT && <span className="text-amber-700"> About {POSES_PER_CATEGORY_HINT} per category is easiest for guests to browse; this one has {inTab.length}.</span>}
            </p>
            <PoseUploadButton scope="mine" variant="outline" size="sm" label="Add My Pose" defaultCategory={tab} disabled={disabled}
              onDone={p => { setLibrary(l => l ? [p, ...l] : l); setTab(p.category); onChange({ poseIds: [...ids, p.id] }); }}/>
            <Button variant="outline" size="sm" disabled={disabled || !library} onClick={() => setPicking(true)}><Plus className="w-3.5 h-3.5 mr-1"/>Choose {categoryLabel(tab)} Poses</Button>
          </div>
          {inTab.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {inTab.map((id, i) => {
                const p = byId.get(id);
                return (
                  <div key={id} className="border border-gray-100 rounded-xl p-2 flex flex-col gap-1.5">
                    {p && <PoseThumb pose={p}/>}
                    <p className="text-xs font-medium leading-tight truncate" title={p?.name}>{i + 1}. {p?.name ?? 'Pose'}</p>
                    <div className="flex flex-wrap gap-1">
                      {p && <Badge variant="default">{p.source === 'account' ? 'My pose' : 'Standard'}</Badge>}
                      {p && !p.isActive && <Badge variant="warning">No longer offered</Badge>}
                    </div>
                    <div className="flex items-center mt-auto">
                      <Button variant="ghost" size="icon" disabled={disabled || i === 0} onClick={() => move(id, -1)} aria-label="Move earlier"><ArrowLeft className="w-3.5 h-3.5"/></Button>
                      <Button variant="ghost" size="icon" disabled={disabled || i === inTab.length - 1} onClick={() => move(id, 1)} aria-label="Move later"><ArrowRight className="w-3.5 h-3.5"/></Button>
                      <div className="flex-1"/>
                      <Button variant="ghost" size="icon" disabled={disabled} onClick={() => toggle(id)} aria-label="Remove"><X className="w-3.5 h-3.5"/></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-gray-400 py-3">No {categoryLabel(tab)} poses chosen.</p>}
          <p className="text-xs text-gray-400">Add your own in <Link href="/genie/poses" className="text-brand hover:underline">Genie → Poses</Link>.</p>
        </>
      )}

      <Modal open={picking} onClose={() => setPicking(false)} title={`Choose ${categoryLabel(tab)} Poses`} className="max-w-3xl">
        {library && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-gray-500 flex-1">{inTab.length} chosen. New picks go to the end. About {POSES_PER_CATEGORY_HINT} per category is easiest for guests.</p>
              {libraryInTab.length > 0 && <Button variant="outline" size="sm" onClick={selectAll}>{allOn ? 'Clear all' : 'Select all'}</Button>}
            </div>
            {libraryInTab.length === 0 ? <p className="text-sm text-gray-400 py-6 text-center">No {categoryLabel(tab)} poses in your library yet. Add one.</p> : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {libraryInTab.map(p => {
                  const on = ids.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggle(p.id)}
                      className={'relative text-left rounded-xl border p-1.5 transition-colors ' + (on ? 'border-brand ring-2 ring-brand/30 bg-blue-50/40' : 'border-gray-200 hover:border-gray-300')}>
                      {on && <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-brand text-white flex items-center justify-center z-10"><Check className="w-3 h-3"/></span>}
                      <PoseThumb pose={p}/>
                      <p className="text-[11px] font-medium mt-1 leading-tight line-clamp-2">{p.name}</p>
                      <p className="text-[10px] text-gray-400">{p.source === 'account' ? 'My pose' : 'Standard'}</p>
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
