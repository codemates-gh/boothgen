'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Repeat, Eye, EyeOff } from 'lucide-react';
import { ClipDesignPicture, type ClipDesignRow } from '@/components/genie/parts';
import { BOOMERANG_FORMATS, CLIP_CANVAS, type BoomerangFormat } from '@/lib/genie/schemas';

// Standard Boomerang designs: designed here per shape, switched on/off for operators (like Standard props). Published
// single-photo Design Templates are offered too, at Portrait 4x6 and Landscape 6x4 (listed read-only below).
export default function BoomerangDesignsManager() {
  const [rows, setRows] = useState<ClipDesignRow[] | null>(null);
  const [fromTemplates, setFromTemplates] = useState<ClipDesignRow[]>([]);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<ClipDesignRow | null>(null);
  const [newFormat, setNewFormat] = useState<BoomerangFormat>('square');
  const [filter, setFilter] = useState<BoomerangFormat | 'all'>('all');

  async function load() {
    const r = await fetch('/api/genie-clip-designs');
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load designs'); return; }
    setRows(d.standard);
    setFromTemplates(d.standardPrint ?? []);
  }
  useEffect(() => { load(); }, []);

  async function setActive(t: ClipDesignRow, isActive: boolean) {
    setError('');
    const r = await fetch('/api/genie-clip-designs/' + t.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive }) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || 'Could not change it'); return; }
    setRows(rs => rs && rs.map(x => x.id === t.id ? { ...x, isActive } : x));
  }

  async function remove() {
    if (!removing) return;
    const r = await fetch('/api/genie-clip-designs/' + removing.id, { method: 'DELETE' });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not delete');
    setRemoving(null);
    load();
  }

  const shown = rows?.filter(t => filter === 'all' || t.format === filter) ?? null;
  const shownTemplates = fromTemplates.filter(t => filter === 'all' || t.format === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={filter} onChange={e => setFilter(e.target.value as BoomerangFormat | 'all')} className="w-48">
          <option value="all">All shapes</option>
          {BOOMERANG_FORMATS.map(f => <option key={f} value={f}>{CLIP_CANVAS[f].label}</option>)}
        </Select>
        <div className="flex items-center gap-2">
          <Select value={newFormat} onChange={e => setNewFormat(e.target.value as BoomerangFormat)} className="w-48" aria-label="Shape of the new design">
            {BOOMERANG_FORMATS.map(f => <option key={f} value={f}>{CLIP_CANVAS[f].label}</option>)}
          </Select>
          <Link href={'/super-admin/boomerang-designs/new?format=' + newFormat}><Button><Plus className="w-4 h-4 mr-1.5"/>New Design</Button></Link>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!shown ? <p className="text-sm text-gray-400">Loading…</p> : shown.length === 0 && shownTemplates.length > 0 ? null : shown.length === 0 ? (
        <Card><CardContent className="text-center py-12 text-gray-500">
          <Repeat className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
          <p className="text-sm">No Standard Boomerang designs{filter === 'all' ? '' : ' at this shape'} yet. Choose a shape and design the first one.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {shown.map(t => (
            <Card key={t.id} className="flex flex-col">
              <div className="h-44 bg-gray-50 rounded-t-xl flex items-center justify-center overflow-hidden p-3">
                <ClipDesignPicture d={t} width={150}/>
              </div>
              <CardContent className="pt-3 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm">{t.name}</p>
                  {t.isActive ? <Badge variant="success">On</Badge> : <Badge variant="default">Off</Badge>}
                </div>
                <p className="text-xs text-gray-500">{CLIP_CANVAS[t.format]?.label ?? t.format}</p>
                <div className="flex gap-2 mt-auto pt-1">
                  <Link href={'/super-admin/boomerang-designs/' + t.id} className="flex-1"><Button variant="outline" size="sm" className="w-full"><Pencil className="w-3.5 h-3.5 mr-1.5"/>Design</Button></Link>
                  <Button variant="outline" size="sm" onClick={() => setActive(t, !t.isActive)} title={t.isActive ? 'Hide from operators' : 'Offer to operators'}>
                    {t.isActive ? <><EyeOff className="w-3.5 h-3.5 mr-1.5"/>Turn off</> : <><Eye className="w-3.5 h-3.5 mr-1.5"/>Turn on</>}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-[#E2445C] hover:bg-red-50" onClick={() => setRemoving(t)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {shownTemplates.length > 0 && (
        <div className="space-y-3 pt-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">From Design Templates</h3>
            <p className="text-xs text-gray-500">Published single-photo 4x6 Design Templates are offered as Standard Boomerang designs at Portrait 4x6 and Landscape 6x4, with the Boomerang playing in the photo area. Edit or unpublish them in Design Templates.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {shownTemplates.map(t => (
              <Card key={t.id + t.format} className="flex flex-col">
                <div className="h-44 bg-gray-50 rounded-t-xl flex items-center justify-center overflow-hidden p-3">
                  <ClipDesignPicture d={t} width={150}/>
                </div>
                <CardContent className="pt-3 flex-1 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm">{t.name}</p>
                    <Badge variant="success">On</Badge>
                  </div>
                  <p className="text-xs text-gray-500">{CLIP_CANVAS[t.format]?.label ?? t.format} · Design Template</p>
                  <div className="flex gap-2 mt-auto pt-1">
                    <Link href={'/super-admin/design-templates/' + t.id} className="flex-1"><Button variant="outline" size="sm" className="w-full"><Pencil className="w-3.5 h-3.5 mr-1.5"/>Design</Button></Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete Standard Boomerang Design">
        <p className="text-sm text-gray-600 mb-5">
          <span className="font-medium text-gray-800">{removing?.name}</span> disappears for every operator. Events that chose it go back to the plain Boomerang, with a notice in their Genie tab. To keep it on those events, turn it off instead.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" onClick={remove}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
