'use client';
import { useEffect, useState } from 'react';
import { TopBar } from '@/components/layout/TopBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Pencil, Trash2, Plus, Sparkles, Wand2 } from 'lucide-react';
import { THEME_NO_SAMPLE_NOTE, ThemeFormModal, ThemeThumb, ThemeTryModal, type AiTheme } from '@/components/genie/AiThemes';

// Genie → Themes: the account's own Geniefied themes next to the Standard ones. Chosen per event on its Genie page.
export default function GenieThemesPage() {
  const [data, setData] = useState<{ standard: AiTheme[]; mine: AiTheme[] } | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AiTheme | null | undefined>(undefined);
  const [trying, setTrying] = useState<AiTheme | null>(null);
  const [removing, setRemoving] = useState<{ t: AiTheme; inUse?: string } | null>(null);

  async function load() {
    const r = await fetch('/api/genie-ai-themes');
    if (r.status === 403) { setNotEnabled(true); return; }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setError(d.error || 'Could not load themes'); return; }
    setData(d);
  }
  useEffect(() => { load(); }, []);

  function put(saved: AiTheme) {
    setData(d => d && { ...d, mine: d.mine.some(x => x.id === saved.id) ? d.mine.map(x => x.id === saved.id ? saved : x) : [...d.mine, saved] });
    setTrying(t => t && t.id === saved.id ? saved : t);
  }

  // First try; one in use answers with a warning, and the second click confirms
  async function remove() {
    if (!removing) return;
    setError('');
    const r = await fetch('/api/genie-ai-themes/' + removing.t.id + '?scope=mine' + (removing.inUse ? '&confirm=1' : ''), { method: 'DELETE' });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.code === 'in_use') { setRemoving({ ...removing, inUse: d.error }); return; }
    if (!r.ok) setError(d.error || 'Could not delete');
    setRemoving(null);
    load();
  }

  return (
    <>
      <TopBar title="Themes"/>
      <div className="p-4 sm:p-8 space-y-6 max-w-6xl">
        {notEnabled ? (
          <Card><CardContent className="text-center py-12 text-gray-500">
            <Sparkles className="w-10 h-10 mx-auto mb-3 text-gray-300"/>
            <p className="font-medium text-gray-700 mb-1">Genie is an add-on</p>
            <p className="text-sm">Contact support to enable it for your account.</p>
          </CardContent></Card>
        ) : (
          <>
            <p className="text-sm text-gray-500">Themes for Geniefied, the AI photo booth. Guests pick one and their photos are restyled in it. Choose which ones each event offers on the event&apos;s Genie page.</p>
            {error && <p className="text-sm text-red-600">{error}</p>}

            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2"><Wand2 className="w-4 h-4"/>My themes</CardTitle>
                    <p className="text-sm text-gray-500 mt-1">Write your own look. Use Try it to test it on a photo (20 tries a day).</p>
                    <p className="text-xs text-gray-400 mt-1">{THEME_NO_SAMPLE_NOTE}</p>
                  </div>
                  <Button onClick={() => setEditing(null)}><Plus className="w-4 h-4 mr-1.5"/>Add Theme</Button>
                </div>
              </CardHeader>
              <CardContent>
                {!data ? <p className="text-sm text-gray-400">Loading…</p> : data.mine.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">You haven&apos;t added any themes yet.</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {data.mine.map(t => (
                      <div key={t.id} className="border border-gray-100 rounded-xl p-2 flex flex-col gap-1.5">
                        <ThemeThumb theme={t}/>
                        <p className="text-sm font-medium leading-tight">{t.name}</p>
                        <div className="flex flex-wrap gap-1 mt-auto">
                          <Button variant="outline" size="sm" className="px-2" onClick={() => setEditing(t)}><Pencil className="w-3.5 h-3.5 mr-1"/>Edit</Button>
                          <Button variant="outline" size="sm" className="px-2" onClick={() => setTrying(t)}><Wand2 className="w-3.5 h-3.5 mr-1"/>Try it</Button>
                          <Button variant="ghost" size="sm" className="px-2 text-[#E2445C] hover:bg-red-50" onClick={() => setRemoving({ t })} aria-label="Delete"><Trash2 className="w-3.5 h-3.5"/></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Standard themes</CardTitle>
                <p className="text-sm text-gray-500 mt-1">Ready to use. Made by BoothGen.</p>
              </CardHeader>
              <CardContent>
                {!data ? <p className="text-sm text-gray-400">Loading…</p> : data.standard.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">No Standard themes yet.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    {data.standard.map(t => (
                      <div key={t.id} className="flex flex-col gap-1.5">
                        <ThemeThumb theme={t}/>
                        <p className="text-xs font-medium leading-tight">{t.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <ThemeFormModal scope="mine" theme={editing} onClose={() => setEditing(undefined)} onSaved={saved => { setEditing(undefined); put(saved); }}/>
      <ThemeTryModal scope="mine" theme={trying} onClose={() => setTrying(null)} onSaved={put}/>
      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Delete Theme">
        <p className="text-sm text-gray-600 mb-2">Delete <span className="font-medium text-gray-800">{removing?.t.name}</span>?</p>
        {removing?.inUse && <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">{removing.inUse} Delete it anyway?</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="destructive" onClick={remove}>{removing?.inUse ? 'Delete Anyway' : 'Delete'}</Button>
        </div>
      </Modal>
    </>
  );
}
