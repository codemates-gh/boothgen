'use client';
import { useEffect, useState } from 'react';
import { Pencil, Trash2, Download, Plus, Wand2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Toggle } from '@/components/genie/parts';
import { THEME_NO_SAMPLE_NOTE, ThemeFormModal, ThemeThumb, ThemeTryModal, type AiTheme } from '@/components/genie/AiThemes';

// Super Admin → AI themes: the Standard Geniefied themes every operator picks from
export default function AiThemesManager() {
  const [rows, setRows] = useState<AiTheme[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<AiTheme | null | undefined>(undefined);
  const [trying, setTrying] = useState<AiTheme | null>(null);
  const [removing, setRemoving] = useState<{ t: AiTheme; inUse?: string } | null>(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    const r = await fetch('/api/super-admin/ai-themes');
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load themes'); return; }
    setRows(d.themes);
  }
  useEffect(() => { load(); }, []);

  function put(saved: AiTheme) {
    setRows(rs => rs && (rs.some(x => x.id === saved.id) ? rs.map(x => x.id === saved.id ? saved : x) : [...rs, saved]));
    setTrying(t => t && t.id === saved.id ? saved : t);
  }

  async function toggle(t: AiTheme) {
    setError('');
    const r = await fetch('/api/genie-ai-themes/' + t.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'standard', isActive: !t.isActive }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not change it'); return; }
    put(d.theme);
  }

  // First try; one in use answers with a warning, and the second click confirms
  async function remove() {
    if (!removing) return;
    setError('');
    const r = await fetch('/api/genie-ai-themes/' + removing.t.id + '?scope=standard' + (removing.inUse ? '&confirm=1' : ''), { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.code === 'in_use') { setRemoving({ ...removing, inUse: d.error }); return; }
    if (!r.ok) setError(d.error || 'Could not delete');
    setRemoving(null);
    load();
  }

  async function importStarter() {
    setImporting(true); setError(''); setNotice('');
    const r = await fetch('/api/super-admin/ai-themes/import', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    setImporting(false);
    if (!r.ok) setError(d.error || 'The import failed');
    else setNotice(d.added ? `Added ${d.added} themes. Give each one a sample before guests can pick it.` : 'Every starter theme is already in the library.');
    load();
  }

  const on = rows?.filter(t => t.isActive).length ?? 0;
  const noSample = rows?.filter(t => !t.sample).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        <div className="flex-1 space-y-1">
          <p className="text-sm text-gray-500">
            Standard themes operators can offer. Switching one off hides it from every operator.
            {rows && <> <span className="font-medium text-gray-700">{on} on</span> · {rows.length - on} off{noSample ? ` · ${noSample} without a sample` : ''}.</>}
          </p>
          <p className="text-xs text-gray-400">{THEME_NO_SAMPLE_NOTE}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-start">
          <Button variant="outline" onClick={importStarter} disabled={importing}><Download className="w-4 h-4 mr-1.5"/>{importing ? 'Adding…' : 'Add the 12 starter themes'}</Button>
          <Button onClick={() => setEditing(null)}><Plus className="w-4 h-4 mr-1.5"/>Add Theme</Button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}

      {!rows ? <p className="text-sm text-gray-400">Loading…</p> : rows.length === 0 ? (
        <Card><CardContent className="text-center py-12 text-gray-500">
          <Wand2 className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
          <p className="text-sm">No Standard themes yet. Add the 12 starter themes or add your own.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {rows.map(t => (
            <Card key={t.id} className={'flex flex-col ' + (t.isActive ? '' : 'opacity-60')}>
              <div className="p-2"><ThemeThumb theme={t}/></div>
              <CardContent className="pt-1 pb-3 px-2 flex-1 flex flex-col gap-2">
                <p className="font-medium text-sm leading-tight">{t.name}</p>
                {(t.fastModel || t.qualityModel) && <p className="text-[10px] text-gray-400 truncate">{[t.fastModel, t.qualityModel].filter(Boolean).join(' · ')}</p>}
                <Toggle checked={t.isActive} onChange={() => toggle(t)} label={t.isActive ? 'On' : 'Off'}/>
                <div className="flex flex-wrap gap-1 mt-auto">
                  <Button variant="outline" size="sm" className="px-2" onClick={() => setEditing(t)}><Pencil className="w-3.5 h-3.5 mr-1"/>Edit</Button>
                  <Button variant="outline" size="sm" className="px-2" onClick={() => setTrying(t)}><Wand2 className="w-3.5 h-3.5 mr-1"/>Try it</Button>
                  <Button variant="ghost" size="sm" className="px-2 text-[#E2445C] hover:bg-red-50" onClick={() => setRemoving({ t })} aria-label="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ThemeFormModal scope="standard" theme={editing} onClose={() => setEditing(undefined)} onSaved={saved => { setEditing(undefined); put(saved); }}/>
      <ThemeTryModal scope="standard" theme={trying} onClose={() => setTrying(null)} onSaved={put}/>
      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete Standard Theme">
        <p className="text-sm text-gray-600 mb-2"><span className="font-medium text-gray-800">{removing?.t.name}</span> is deleted for good. To hide it instead, switch it off.</p>
        {removing?.inUse && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">{removing.inUse} Delete it anyway?</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" onClick={remove}>{removing?.inUse ? 'Delete Anyway' : 'Delete'}</Button>
        </div>
      </Modal>
    </div>
  );
}
