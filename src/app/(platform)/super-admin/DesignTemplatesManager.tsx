'use client';
import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Plus, Edit2, Trash2, Eye, EyeOff, Layout, X } from 'lucide-react';

const FONT_OPTIONS = [
  { id: 'playfair', label: 'Playfair Display', fontFamily: "'Playfair Display', serif" },
  { id: 'cormorant', label: 'Cormorant Garamond', fontFamily: "'Cormorant Garamond', serif" },
  { id: 'cinzel', label: 'Cinzel', fontFamily: "'Cinzel', serif" },
  { id: 'montserrat', label: 'Montserrat', fontFamily: "'Montserrat', sans-serif" },
  { id: 'raleway', label: 'Raleway', fontFamily: "'Raleway', sans-serif" },
  { id: 'josefin', label: 'Josefin Sans', fontFamily: "'Josefin Sans', sans-serif" },
  { id: 'lato', label: 'Lato', fontFamily: "'Lato', sans-serif" },
  { id: 'bebas', label: 'Bebas Neue', fontFamily: "'Bebas Neue', cursive" },
  { id: 'great-vibes', label: 'Great Vibes', fontFamily: "'Great Vibes', cursive" },
  { id: 'dancing', label: 'Dancing Script', fontFamily: "'Dancing Script', cursive" },
  { id: 'pacifico', label: 'Pacifico', fontFamily: "'Pacifico', cursive" },
  { id: 'sacramento', label: 'Sacramento', fontFamily: "'Sacramento', cursive" },
];

type TextZone = { id: string; label: string; placeholder: string; maxChars: number; required: boolean; hint?: string };
type ColorVariant = { id: string; name: string; colors: { background: string; text: string; accent: string } };
type FontPairing = { id: string; name: string; fonts: { zoneId: string; fontId: string; label: string; fontFamily: string }[] };
type Template = {
  id: string; name: string; description?: string; format: string; orientation: string;
  photoCount: number; thumbnailUrl?: string; textZones: TextZone[]; colorVariants: ColorVariant[];
  fontPairings: FontPairing[]; isPublished: boolean; sortOrder: number;
};

const newZone = (): TextZone => ({ id: crypto.randomUUID(), label: '', placeholder: '', maxChars: 50, required: true });
const newVariant = (): ColorVariant => ({ id: crypto.randomUUID(), name: '', colors: { background: '#FFFFFF', text: '#000000', accent: '#D4AF37' } });
const newPairing = (zones: TextZone[]): FontPairing => ({
  id: crypto.randomUUID(), name: '',
  fonts: zones.map(z => ({ zoneId: z.id, fontId: 'montserrat', label: z.label || 'Zone', fontFamily: "'Montserrat', sans-serif" })),
});

const FORMAT_LABEL: Record<string, string> = { '2x6': '2"×6" Strip', '4x6': '4"×6" Full Size' };

export default function DesignTemplatesManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', format: '4x6', orientation: 'landscape', photoCount: 3, thumbnailUrl: '' });
  const [zones, setZones] = useState<TextZone[]>([newZone()]);
  const [variants, setVariants] = useState<ColorVariant[]>([newVariant()]);
  const [pairings, setPairings] = useState<FontPairing[]>([]);

  useEffect(() => { load(); }, []);
  async function load() {
    const r = await fetch('/api/super-admin/design-templates');
    if (r.ok) setTemplates(await r.json());
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', description: '', format: '4x6', orientation: 'landscape', photoCount: 3, thumbnailUrl: '' });
    const z = [newZone()];
    setZones(z);
    setVariants([newVariant()]);
    setPairings([newPairing(z)]);
    setShowModal(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setForm({ name: t.name, description: t.description ?? '', format: t.format, orientation: t.orientation, photoCount: t.photoCount, thumbnailUrl: t.thumbnailUrl ?? '' });
    setZones(t.textZones.length ? t.textZones : [newZone()]);
    setVariants(t.colorVariants.length ? t.colorVariants : [newVariant()]);
    setPairings(t.fontPairings.length ? t.fontPairings : [newPairing(t.textZones)]);
    setShowModal(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const body = { ...form, photoCount: Number(form.photoCount), textZones: zones.filter(z => z.label.trim()), colorVariants: variants.filter(v => v.name.trim()), fontPairings: pairings.filter(p => p.name.trim()), thumbnailUrl: form.thumbnailUrl || null, description: form.description || null };
    const url = editing ? `/api/super-admin/design-templates/${editing.id}` : '/api/super-admin/design-templates';
    const res = await fetch(url, { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) { await load(); setShowModal(false); }
    setSaving(false);
  }

  async function togglePublish(t: Template) {
    await fetch(`/api/super-admin/design-templates/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPublished: !t.isPublished }) });
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this template? This cannot be undone.')) return;
    await fetch(`/api/super-admin/design-templates/${id}`, { method: 'DELETE' });
    await load();
  }

  const setZ = (i: number, k: keyof TextZone, v: unknown) => setZones(z => z.map((zn, idx) => idx === i ? { ...zn, [k]: v } : zn));
  const setV = (i: number, k: string, v: unknown) => setVariants(vs => vs.map((vt, idx) => idx === i ? (k.startsWith('colors.') ? { ...vt, colors: { ...vt.colors, [k.split('.')[1]]: v } } : { ...vt, [k]: v }) : vt));
  const setP = (i: number, k: keyof FontPairing, v: unknown) => setPairings(ps => ps.map((p, idx) => idx === i ? { ...p, [k]: v } : p));
  const setPFont = (pIdx: number, fIdx: number, fontId: string) => {
    const font = FONT_OPTIONS.find(f => f.id === fontId);
    if (!font) return;
    setPairings(ps => ps.map((p, i) => i !== pIdx ? p : {
      ...p,
      fonts: p.fonts.map((f, j) => j !== fIdx ? f : { ...f, fontId, fontFamily: font.fontFamily }),
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Design Template Library</h3>
          <p className="text-sm text-gray-500 mt-0.5">Shared templates available to all operators. Publish to make visible.</p>
        </div>
        <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2"/>New Template</Button>
      </div>

      {templates.length === 0 ? (
        <Card><CardContent className="text-center py-12 text-gray-400">
          <Layout className="w-10 h-10 mx-auto mb-3 opacity-30"/>
          <p className="font-medium">No templates yet</p>
          <p className="text-sm mt-1">Create your first shared design template</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <Card key={t.id}>
              <CardContent className="flex items-center gap-4 py-3">
                {t.thumbnailUrl ? (
                  <img src={t.thumbnailUrl} alt={t.name} className="w-14 h-10 object-cover rounded border border-gray-200 flex-shrink-0"/>
                ) : (
                  <div className="w-14 h-10 rounded border border-dashed border-gray-300 flex items-center justify-center flex-shrink-0 bg-gray-50">
                    <Layout className="w-4 h-4 text-gray-300"/>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{t.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${t.isPublished ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {t.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {FORMAT_LABEL[t.format] ?? t.format} · {t.orientation} · {t.photoCount} photos · {t.textZones.length} zones · {t.colorVariants.length} palettes
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => togglePublish(t)} title={t.isPublished ? 'Unpublish' : 'Publish'}>
                    {t.isPublished ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEdit(t)}><Edit2 className="w-4 h-4 mr-1"/>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-600" onClick={() => remove(t.id)}><Trash2 className="w-4 h-4"/></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Template' : 'New Design Template'}>
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Template Name</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Classic 4x6 Landscape"/>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Description (optional)</label>
              <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description for operators"/>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Format</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.format} onChange={e => setForm(f => ({ ...f, format: e.target.value }))}>
                <option value="4x6">4"×6" Full Size</option>
                <option value="2x6">2"×6" Strip</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Orientation</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.orientation} onChange={e => setForm(f => ({ ...f, orientation: e.target.value }))}>
                <option value="landscape">Landscape</option>
                <option value="portrait">Portrait</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Photo Count</label>
              <Input type="number" min={1} max={10} value={form.photoCount} onChange={e => setForm(f => ({ ...f, photoCount: Number(e.target.value) }))}/>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Thumbnail URL (R2)</label>
              <Input value={form.thumbnailUrl} onChange={e => setForm(f => ({ ...f, thumbnailUrl: e.target.value }))} placeholder="https://..."/>
            </div>
          </div>

          {/* Text Zones */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Text Zones</label>
              <Button variant="ghost" size="sm" onClick={() => setZones(z => [...z, newZone()])}><Plus className="w-3 h-3 mr-1"/>Add</Button>
            </div>
            <div className="space-y-2">
              {zones.map((z, i) => (
                <div key={z.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input value={z.label} onChange={e => setZ(i, 'label', e.target.value)} placeholder="Zone label (e.g. Event Title)"/>
                    <Button variant="ghost" size="sm" onClick={() => setZones(zs => zs.filter((_, j) => j !== i))}><X className="w-3 h-3"/></Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={z.placeholder} onChange={e => setZ(i, 'placeholder', e.target.value)} placeholder="Placeholder text"/>
                    <Input type="number" value={z.maxChars} onChange={e => setZ(i, 'maxChars', Number(e.target.value))} placeholder="Max chars"/>
                  </div>
                  <Input value={z.hint ?? ''} onChange={e => setZ(i, 'hint', e.target.value)} placeholder="Hint for client (optional)"/>
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={z.required} onChange={e => setZ(i, 'required', e.target.checked)}/> Required
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Color Variants */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Color Palettes</label>
              <Button variant="ghost" size="sm" onClick={() => setVariants(v => [...v, newVariant()])}><Plus className="w-3 h-3 mr-1"/>Add</Button>
            </div>
            <div className="space-y-2">
              {variants.map((v, i) => (
                <div key={v.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input value={v.name} onChange={e => setV(i, 'name', e.target.value)} placeholder="Palette name (e.g. Blush Rose)"/>
                    <Button variant="ghost" size="sm" onClick={() => setVariants(vs => vs.filter((_, j) => j !== i))}><X className="w-3 h-3"/></Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['background', 'text', 'accent'] as const).map(key => (
                      <label key={key} className="flex flex-col items-center gap-1">
                        <span className="text-xs text-gray-500 capitalize">{key}</span>
                        <input type="color" value={v.colors[key]} onChange={e => setV(i, `colors.${key}`, e.target.value)} className="w-10 h-8 rounded cursor-pointer border border-gray-200"/>
                        <span className="text-[10px] text-gray-400">{v.colors[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Font Pairings */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Font Pairings</label>
              <Button variant="ghost" size="sm" onClick={() => setPairings(ps => [...ps, newPairing(zones)])}><Plus className="w-3 h-3 mr-1"/>Add</Button>
            </div>
            <div className="space-y-2">
              {pairings.map((p, pi) => (
                <div key={p.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <div className="flex gap-2">
                    <Input value={p.name} onChange={e => setP(pi, 'name', e.target.value)} placeholder="Pairing name (e.g. Elegant Serif)"/>
                    <Button variant="ghost" size="sm" onClick={() => setPairings(ps => ps.filter((_, j) => j !== pi))}><X className="w-3 h-3"/></Button>
                  </div>
                  {p.fonts.map((f, fi) => (
                    <div key={f.zoneId} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20 truncate">{f.label}</span>
                      <select className="flex-1 border rounded px-2 py-1 text-xs" value={f.fontId} onChange={e => setPFont(pi, fi, e.target.value)}>
                        {FONT_OPTIONS.map(fo => <option key={fo.id} value={fo.id}>{fo.label}</option>)}
                      </select>
                      <span className="text-xs text-gray-400 w-24 truncate" style={{ fontFamily: f.fontFamily }}>Sample</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Template'}</Button>
        </div>
      </Modal>
    </div>
  );
}
