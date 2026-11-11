'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Plus, Pencil, Trash2, LayoutTemplate } from 'lucide-react';
import { Layout, LayoutPreview } from '@/components/genie/parts';

type Row = {
  id: string; name: string; description: string | null; isPublished: boolean; layout: Layout | null; thumbnail: { url: string } | null; thumbnailUrl: string | null;
  textZones: unknown[]; colorVariants: unknown[]; fontPairings: unknown[];
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const SIZE: Record<string, string> = { '4x6-landscape': '4×6 landscape', '4x6-portrait': '4×6 portrait', '2x6-portrait': '2×6 strip' };

// Standard layouts: designed here, shown in every operator's Standard templates and their clients' design picker
export default function DesignTemplatesManager() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState<Row | null>(null);

  async function load() {
    const r = await fetch('/api/genie-templates');
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load templates'); return; }
    setRows(d.standard);
  }
  useEffect(() => { load(); }, []);

  async function remove() {
    if (!removing) return;
    const r = await fetch('/api/genie-templates/' + removing.id, { method: 'DELETE' });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error || 'Could not delete');
    setRemoving(null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/super-admin/design-templates/new"><Button><Plus className="w-4 h-4 mr-1.5"/>New Template</Button></Link>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!rows ? <p className="text-sm text-gray-400">Loading…</p> : rows.length === 0 ? (
        <Card><CardContent className="text-center py-12 text-gray-500">
          <LayoutTemplate className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
          <p className="text-sm">No Standard templates yet. Design the first one.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {rows.map(t => (
            <Card key={t.id} className="flex flex-col">
              <div className="h-44 bg-gray-50 rounded-t-xl flex items-center justify-center overflow-hidden p-3">
                {t.layout ? <LayoutPreview layout={t.layout} width={t.layout.widthPx >= t.layout.heightPx ? 200 : 100}/>
                  : t.thumbnailUrl ? <img src={t.thumbnailUrl} alt="" className="max-h-full"/> : <LayoutTemplate className="w-10 h-10 text-gray-300"/>}
              </div>
              <CardContent className="pt-3 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm">{t.name}</p>
                  {t.isPublished ? <Badge variant="success">Published</Badge> : <Badge variant="default">Draft</Badge>}
                </div>
                <p className="text-xs text-gray-500">
                  {t.layout ? `${SIZE[`${t.layout.format}-${t.layout.orientation}`] ?? t.layout.format} · ${plural(new Set(t.layout.slots.map(s => s.shotIndex)).size, 'photo')}` : 'No photo frames yet'}
                  {' · '}{plural(t.textZones.length, 'text field')} · {plural(t.colorVariants.length, 'palette')} · {plural(t.fontPairings.length, 'font pairing')}
                </p>
                {t.description && <p className="text-xs text-gray-400 line-clamp-2">{t.description}</p>}
                <div className="flex gap-2 mt-auto pt-1">
                  <Link href={'/super-admin/design-templates/' + t.id} className="flex-1"><Button variant="outline" size="sm" className="w-full"><Pencil className="w-3.5 h-3.5 mr-1.5"/>Design</Button></Link>
                  <Button variant="ghost" size="sm" className="text-[#E2445C] hover:bg-red-50" onClick={() => setRemoving(t)} aria-label="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete Standard Template">
        <p className="text-sm text-gray-600 mb-5">
          <span className="font-medium text-gray-800">{removing?.name}</span> disappears from every operator&apos;s Standard templates and from client design pickers. Events and design briefs that already use it keep their copy.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" onClick={remove}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
