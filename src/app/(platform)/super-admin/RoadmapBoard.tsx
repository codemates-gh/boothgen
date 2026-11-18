'use client';
import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import {
  ROADMAP_AREAS, ROADMAP_GROUPS, ROADMAP_STATUSES, roadmapAreaLabel, roadmapGroupLabel, roadmapStatusBadge, roadmapStatusLabel,
} from '@/lib/roadmap/options';

export type RoadmapItem = {
  id: string; title: string; summary: string; status: string; area: string; group: string; sortOrder: number;
  targetDate: string | null; planRef: string | null; shippedAt: string | null; shippedVersion: string | null;
  visibleToOperators: boolean; suggestionCount: number;
};
type Suggestion = { id: string; number: number; title: string; voteCount: number; reporterName: string };

const EMPTY = { title: '', summary: '', status: 'planned', area: 'genie_ipad', group: 'next_up', targetDate: '', planRef: '', shippedAt: '', shippedVersion: '', visibleToOperators: false };
const day = (d: string) => format(new Date(d + 'T12:00:00'), 'MMM d, yyyy');

// Super Admin → Reports → Roadmap. Items are separate from reports (the Dev job never sees them); suggestions are
// linked from a report's triage panel. Order applies within a group; shipped items are listed last, newest first.
export default function RoadmapBoard({ onOpenReport }: { onOpenReport: (id: string) => void }) {
  const [items, setItems] = useState<RoadmapItem[] | null>(null);
  const [editing, setEditing] = useState<RoadmapItem | 'new' | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showShipped, setShowShipped] = useState(false);

  const load = useCallback(() => {
    fetch('/api/roadmap/admin').then(r => r.json()).then(d => setItems(d.items ?? [])).catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!open) { setSuggestions([]); return; }
    fetch(`/api/roadmap/admin/${open}`).then(r => r.json()).then(d => setSuggestions(d.suggestions ?? []));
  }, [open]);

  async function change(id: string, body: Record<string, unknown>) {
    setBusy(true); setError('');
    const res = await fetch(`/api/roadmap/admin/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(d.error || 'Could not save'); return false; }
    load();
    return true;
  }

  function edit(item: RoadmapItem | 'new') {
    setError('');
    setEditing(item);
    setForm(item === 'new' ? EMPTY : {
      title: item.title, summary: item.summary, status: item.status, area: item.area, group: item.group,
      targetDate: item.targetDate ?? '', planRef: item.planRef ?? '', shippedAt: item.shippedAt ?? '', shippedVersion: item.shippedVersion ?? '',
      visibleToOperators: item.visibleToOperators,
    });
  }

  async function save() {
    if (!editing) return;
    const body = {
      title: form.title, summary: form.summary, status: form.status, area: form.area, group: form.group,
      targetDate: form.targetDate || null, planRef: form.planRef.trim() || null, visibleToOperators: form.visibleToOperators,
      shippedVersion: form.shippedVersion.trim() || null,
      // Left empty, moving to Shipped stamps today
      ...(form.shippedAt || editing !== 'new' ? { shippedAt: form.shippedAt || null } : {}),
    };
    if (editing === 'new') {
      setBusy(true); setError('');
      const res = await fetch('/api/roadmap/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) { setError(d.error || 'Could not add the item'); return; }
      setEditing(null); load();
      return;
    }
    // Keep the stamped date when an item goes to Shipped without one
    if (!form.shippedAt && form.status === 'shipped' && editing.status !== 'shipped') delete (body as any).shippedAt;
    if (await change(editing.id, body)) setEditing(null);
  }

  async function remove(item: RoadmapItem) {
    const linked = item.suggestionCount ? ` Its ${item.suggestionCount} linked suggestion${item.suggestionCount > 1 ? 's go' : ' goes'} back to Confirmed.` : '';
    if (!confirm(`Delete "${item.title}" from the roadmap?${linked}`)) return;
    setBusy(true);
    await fetch(`/api/roadmap/admin/${item.id}`, { method: 'DELETE' });
    setBusy(false); setEditing(null); load();
  }

  const set = (k: keyof typeof form, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const active = items?.filter(i => i.status !== 'shipped') ?? [];
  const shipped = items?.filter(i => i.status === 'shipped') ?? [];

  function row(item: RoadmapItem, i: number, list: RoadmapItem[]) {
    const isOpen = open === item.id;
    return (
      <div key={item.id} className="px-4 py-3">
        <div className="flex gap-3 items-start">
          {item.status !== 'shipped' && (
            <div className="flex flex-col shrink-0 -my-1">
              <button aria-label="Move up" disabled={busy || i === 0} onClick={() => change(item.id, { move: 'up' })} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1 leading-none">▲</button>
              <button aria-label="Move down" disabled={busy || i === list.length - 1} onClick={() => change(item.id, { move: 'down' })} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 px-1 leading-none">▼</button>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <button className="text-left" onClick={() => edit(item)}>
              <p className="text-sm font-semibold text-gray-900 hover:text-brand">{item.title}</p>
            </button>
            <p className="text-sm text-gray-600 mt-0.5">{item.summary}</p>
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <Badge variant="default">{roadmapAreaLabel(item.area)}</Badge>
              {item.planRef && <Badge variant="default">{item.planRef}</Badge>}
              {item.targetDate && item.status !== 'shipped' && <Badge variant="warning">Target {day(item.targetDate)}</Badge>}
              {item.status === 'shipped' && <Badge variant="success">Shipped{item.shippedAt ? ' ' + day(item.shippedAt) : ''}{item.shippedVersion ? ` · ${item.shippedVersion}` : ''}</Badge>}
              {item.suggestionCount > 0 && (
                <button onClick={() => setOpen(isOpen ? null : item.id)}>
                  <Badge variant="info">{item.suggestionCount} suggestion{item.suggestionCount > 1 ? 's' : ''}</Badge>
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Select className="w-36" value={item.status} disabled={busy} onChange={e => change(item.id, { status: e.target.value })}>
              {ROADMAP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              Show to operators
              <button
                type="button" role="switch" aria-checked={item.visibleToOperators} disabled={busy}
                onClick={() => change(item.id, { visibleToOperators: !item.visibleToOperators })}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${item.visibleToOperators ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${item.visibleToOperators ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
            </label>
          </div>
        </div>
        {isOpen && (
          <div className="mt-2 ml-8 rounded-lg bg-gray-50 px-3 py-2 space-y-1">
            {suggestions.length === 0 ? <p className="text-xs text-gray-400">Loading…</p> : suggestions.map(s => (
              <button key={s.id} onClick={() => onOpenReport(s.id)} className="block text-left text-xs text-[#0085FF] hover:underline">
                #{s.number} {s.title} <span className="text-gray-400">· {s.voteCount} vote{s.voteCount > 1 ? 's' : ''} · {s.reporterName}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-500 flex-1 min-w-[240px]">Only Super Admins see the roadmap for now. &ldquo;Show to operators&rdquo; marks items to publish later. Link a suggestion from its report to close it as On the roadmap.</p>
        <Button onClick={() => edit('new')}>Add item</Button>
      </div>
      {error && !editing && <p className="text-sm text-red-600">{error}</p>}

      {items === null ? <p className="text-sm text-gray-400">Loading…</p> : (
        <>
          {ROADMAP_GROUPS.map(g => {
            const list = active.filter(i => i.group === g.value);
            return (
              <Card key={g.value}>
                <CardContent className="p-0">
                  <div className="px-4 py-2.5 border-b flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900">{g.label}</p>
                    <span className="text-xs text-gray-400">{list.length}</span>
                    <div className="flex-1" />
                    {ROADMAP_STATUSES.filter(s => s.value !== 'shipped').map(s => {
                      const n = list.filter(i => i.status === s.value).length;
                      return n ? <Badge key={s.value} variant={roadmapStatusBadge(s.value)}>{n} {s.label.toLowerCase()}</Badge> : null;
                    })}
                  </div>
                  {list.length === 0 ? <p className="px-4 py-4 text-sm text-gray-400">Nothing here.</p> : (
                    <div className="divide-y">{list.map((item, i) => row(item, i, list))}</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          <Card>
            <CardContent className="p-0">
              <button onClick={() => setShowShipped(s => !s)} className="w-full px-4 py-2.5 flex items-center gap-2 text-left">
                <p className="text-sm font-semibold text-gray-900">Shipped</p>
                <span className="text-xs text-gray-400">{shipped.length}</span>
                <div className="flex-1" />
                <span className="text-xs text-[#0085FF]">{showShipped ? 'Hide' : 'Show'}</span>
              </button>
              {showShipped && shipped.length > 0 && <div className="divide-y border-t">{shipped.map((item, i) => row(item, i, shipped))}</div>}
            </CardContent>
          </Card>
        </>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add roadmap item' : 'Edit roadmap item'}>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Title</label>
            <Input value={form.title} maxLength={120} onChange={e => set('title', e.target.value)} placeholder="Animated GIF" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">One-line description</label>
            <Input value={form.summary} maxLength={200} onChange={e => set('summary', e.target.value)} placeholder="Short looping GIFs from a burst of photos" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <Select value={form.status} onChange={e => set('status', e.target.value)}>
                {ROADMAP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Area</label>
              <Select value={form.area} onChange={e => set('area', e.target.value)}>
                {ROADMAP_AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </Select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Group</label>
              <Select value={form.group} onChange={e => set('group', e.target.value)}>
                {ROADMAP_GROUPS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Target date (optional)</label>
              <Input type="date" value={form.targetDate} onChange={e => set('targetDate', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Genie plan (optional)</label>
              <Input value={form.planRef} maxLength={120} onChange={e => set('planRef', e.target.value)} placeholder="docs/plan.md P11" />
            </div>
          </div>
          {form.status === 'shipped' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Shipped on</label>
                <Input type="date" value={form.shippedAt} onChange={e => set('shippedAt', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Version</label>
                <Input value={form.shippedVersion} maxLength={40} onChange={e => set('shippedVersion', e.target.value)} placeholder="2.108.0" />
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.visibleToOperators} onChange={e => set('visibleToOperators', e.target.checked)} />
            Show to operators <span className="text-xs text-gray-400">(not published anywhere yet)</span>
          </label>
          {editing && editing !== 'new' && <p className="text-xs text-gray-400">Id for the roadmap script: {editing.id} · {roadmapGroupLabel(editing.group)} · {roadmapStatusLabel(editing.status)}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2 pt-1">
            {editing && editing !== 'new' && <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove(editing)} className="text-red-600">Delete</Button>}
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button disabled={busy || !form.title.trim() || !form.summary.trim()} onClick={save}>{editing === 'new' ? 'Add' : 'Save'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
